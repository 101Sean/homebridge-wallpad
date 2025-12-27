const net = require('net');
const DoorbellAccessory = require('./accessory/DoorbellAccessory');
const DoorLockAccessory = require('./accessory/DoorlockAccessory');

module.exports = (api) => {
    api.registerPlatform('homebridge-wallpad', 'WallpadPlatform', WallpadPlatform);
};

class WallpadPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.tcpClient = null;

        if (!config) return;

        this.api.on('didFinishLaunching', () => {
            this.publishExternalAccessory();
        });
    }

    publishExternalAccessory() {
        const bellName = this.config.bellName || '공동현관 초인종';
        const bellUuid = this.api.hap.uuid.generate('homebridge-wallpad-bell');
        const bellAccessory = new this.api.platformAccessory(bellName, bellUuid, 18);
        this.bell = new DoorbellAccessory(this.log, this.config, this.api, bellAccessory);
        this.api.publishExternalAccessories('homebridge-wallpad', [bellAccessory]);

        const lockName = this.config.lockName || '공동현관 문열기';
        const lockUuid = this.api.hap.uuid.generate('homebridge-wallpad-lock');
        const lockAccessory = new this.api.platformAccessory(lockName, lockUuid, 6);
        this.lock = new DoorLockAccessory(this.log, this.config, this.api, lockAccessory, this);
        this.api.publishExternalAccessories('homebridge-wallpad', [lockAccessory]);

        // this.connectToEW11();
    }

    connectToEW11() {
        const host = this.config.ip;
        const port = this.config.port || 8899;

        this.tcpClient = new net.Socket();
        this.tcpClient.connect(port, host, () => {
            this.log.info(`[연결] EW11 감시 시작 (${host}:${port})`);
        });

        this.tcpClient.on('data', (data) => {
            const hexData = data.toString('hex').toUpperCase();
            if (hexData.includes('AA55010108')) {
                if (this.bell) this.bell.trigger();
            }
        });

        this.tcpClient.on('error', (err) => this.log.error(`[TCP 에러] ${err.message}`));
        this.tcpClient.on('close', () => {
            setTimeout(() => this.connectToEW11(), 10000);
        });
    }

    sendPacket(packet) {
        if (this.tcpClient && !this.tcpClient.destroyed) {
            this.tcpClient.write(Buffer.from(packet, 'hex'));
            return true;
        }
        return false;
    }

    accessories(callback) { callback([]); }
}