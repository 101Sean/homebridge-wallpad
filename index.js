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
        const name = this.config.name || '공동현관 시스템';
        const uuid = this.api.hap.uuid.generate('homebridge-wallpad-external-v1');

        const accessory = new this.api.platformAccessory(name, uuid, 18);

        this.bell = new DoorbellAccessory(this.log, this.config, this.api, accessory);
        this.lock = new DoorLockAccessory(this.log, this.config, this.api, accessory, this);

        this.api.publishExternalAccessories('homebridge-wallpad', [accessory]);
        this.log.info(`[External] '${name}' 배포 완료. 홈앱에서 [액세서리 추가]를 통해 직접 등록하세요.`);

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