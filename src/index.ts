import { EventEmitter } from "events";
import noble from "@abandonware/noble";
import { Strip, StripType } from "./models";
import { isValid } from "./validation";

process.env.NOBLE_REPORT_ALL_HCI_EVENTS = "1";

const WRITE_CHAR_UUID = "000102030405060708090a0b0c0d2b11";

export declare interface StripControl {
    // Permanent listeners
    on(event: "deviceFound", listener: (p: noble.Peripheral) => void): this;
    on(event: "stripFound", listener: (strip: Strip) => void): this;

    // Temporary (only once) listeners
    once(event: "deviceFound", listener: (p: noble.Peripheral) => void): this;
    once(event: "stripFound", listener: (strip: Strip) => void): this;

    // Remove listeners
    removeListener(event: "deviceFound", listener: (p: noble.Peripheral) => void): this;
    removeListener(event: "stripFound", listener: (strip: Strip) => void): this;
}

export class StripControl extends EventEmitter {
    private cache: {
        [uuid: string]: Strip
    } = {};

    private async _onDiscover(peripheral: noble.Peripheral) {
        const { uuid, advertisement } = peripheral;
        this.emit("deviceFound", peripheral);
        
        const model = isValid(peripheral);
        if (model === StripType.UNKNOWN) return;
        if (this.cache[uuid]) return;
    
        await peripheral.connectAsync();
        const chars = await peripheral.discoverSomeServicesAndCharacteristicsAsync([], [
            WRITE_CHAR_UUID
        ]);
        if (!chars.characteristics) return;
        const writeChar = chars.characteristics[0];
    
        // Create the lightstrip
        const strip = new Strip(uuid, advertisement.localName, model, writeChar);
        this.cache[strip.uuid] = strip;

        this.emit("stripFound", strip);
    
        const interval = setInterval(() => strip.keepAlive(), 2000);
        peripheral.on("disconnect", () => {
            clearInterval(interval);
            delete this.cache[strip.uuid];
        });
    };

    private _onScanStart() {
        console.log("Scan started");
    };

    private _onScanStop() {
        console.log("Scan stopped");
    }

    constructor() {
        super();
    }

    public async startDiscovery() {
        noble.on("discover", this._onDiscover.bind(this));
        noble.on("scanStart", this._onScanStart.bind(this));
        noble.on("scanStop", this._onScanStop.bind(this));
        await noble.startScanningAsync([], false);
    }

    public async stopDiscovery() {
        await noble.stopScanningAsync();
        noble.removeListener("discover", this._onDiscover.bind(this));
        noble.removeListener("scanStart", this._onScanStart.bind(this));
        noble.removeListener("scanStop", this._onScanStop.bind(this));
    }
};
