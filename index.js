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
        this.dataBuffer = "";
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
        const { ip = '192.168.0.79', port = 8899 } = this.config;
        const bellPacket = (this.config.bellPacket || '418efcd6').toLowerCase().replace(/\s/g, '');

        this.tcpClient = new net.Socket();
        this.tcpClient.setTimeout(60000);
        this.tcpClient.connect(port, ip, () => this.log.info(`[연결 성공] EW11 (${ip}:${port})`));

        this.tcpClient.on('data', (data) => {
            const hexChunk = data.toString('hex').toLowerCase();
            this.dataBuffer += hexChunk;

            this.log.debug(`[수신 데이터]: ${hexChunk}`);

            if (this.dataBuffer.includes(bellPacket)) {
                const now = Date.now();
                if (!this.recentBellPackets) this.recentBellPackets = [];
                this.recentBellPackets.push(now);
                this.recentBellPackets = this.recentBellPackets.filter(time => now - time < 3000);

                if (this.recentBellPackets.length >= 3) {
                    if (now - this.lastBellTime > 20000) {
                        if (this.bell) this.bell.trigger();
                        this.lastBellTime = now;
                        this.recentBellPackets = [];
                    }
                }

                const index = this.dataBuffer.indexOf(bellPacket);
                this.dataBuffer = this.dataBuffer.slice(index + bellPacket.length);
            }

            // 버퍼 무한 증식 방지
            if (this.dataBuffer.length > 500)  this.dataBuffer = this.dataBuffer.slice(-200);
        });

        this.tcpClient.on('timeout', () => {
            this.log.warn('[Timeout] 소켓을 재연결합니다.');
            this.tcpClient.destroy();
        });
        this.tcpClient.on('error', (err) => {
            this.log.error(`[TCP 에러] ${err.message}`);
        });
        this.tcpClient.on('close', () => {
            this.log.warn('[연결 종료] 10초 후 재연결을 시도합니다.');
            setTimeout(() => this.connectToEW11(), 10000);
        });
    }

    sendPacket(packet) {
        if (this.tcpClient && !this.tcpClient.destroyed) {
            const cleanPacket = packet.toLowerCase().replace(/\s/g, '');
            this.tcpClient.write(Buffer.from(cleanPacket, 'hex'));
            this.log.debug(`📤 패킷 전송: ${cleanPacket}`);
            return true;
        }
        this.log.error('[전송 실패] EW11 연결 확인 필요');
        return false;
    }
}