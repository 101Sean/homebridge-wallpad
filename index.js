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
        this.lastBellTime = 0;

        if (!config) return;

        this.api.on('didFinishLaunching', () => {
            this.publishExternalAccessory();
            this.connectToEW11();
        });
    }

    publishExternalAccessory() {
        const bellName = this.config.bellName || 'Doorbell';
        const bellUuid = this.api.hap.uuid.generate('homebridge-wallpad-bell');
        const bellAccessory = new this.api.platformAccessory(bellName, bellUuid, 18);
        this.bell = new DoorbellAccessory(this.log, this.config, this.api, bellAccessory);
        this.api.publishExternalAccessories('homebridge-wallpad', [bellAccessory]);
    }

    accessories(callback) {
        const name = this.config.lockName || 'Doorlock';
        this.lock = new DoorLockAccessory(this.log, this.config, this.api, name, this);
        callback([this.lock]);
    }

    connectToEW11() {
        const host = this.config.ip || '192.168.0.79';
        const port = this.config.port || 8899;
        const bellPacket = (this.config.bellPacket || '33000006803300088833').toLowerCase().replace(/\s/g, '');

        if (this.tcpClient) {
            this.tcpClient.destroy();
            this.tcpClient.removeAllListeners();
        }
        this.tcpClient = new net.Socket();

        this.tcpClient.connect(port, host, () => {
            this.log.info(`[연결] EW11 감시 시작 (${host}:${port})`);
        });

        this.tcpClient.on('data', (data) => {
            const hexData = data.toString('hex').toLowerCase();
            // this.log.debug(`[수신] ${hexData}`);
            if (hexData.includes(bellPacket)) {
                const now = Date.now();
                if (now - this.lastBellTime > 3000) {
                    if (this.bell) this.bell.trigger();
                    this.lastBellTime = now;
                }
            }
        });

        this.tcpClient.on('error', (err) => this.log.error(`[TCP 에러] ${err.message}`));
        this.tcpClient.on('close', () => {
            setTimeout(() => this.connectToEW11(), 10000);
        });
    }

    sendPacket(packet) {
        if (this.tcpClient && !this.tcpClient.destroyed) {
            const cleanPacket = packet.toLowerCase().replace(/\s/g, '');
            this.tcpClient.write(Buffer.from(cleanPacket, 'hex'));
            return true;
        }
        this.log.error('[전송 실패] EW11 연결 확인 필요');
        return false;
    }
}