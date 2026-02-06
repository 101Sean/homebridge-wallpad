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

        this.bellCooldown = this.config.bellCooldown || 5000;
        this.targetBellPacket = (this.config.bellPacket || '').toLowerCase().replace(/\s/g, '');
        this.targetOpenPacket = (this.config.openPacket || '').toLowerCase().replace(/\s/g, '');
        this.sequenceEndTrigger = (this.config.sequenceEndTrigger || '').toLowerCase().replace(/\s/g, '');
        this.timing = this.config.timingSet || { interval: 10, repeat: 2, delay: 10 };

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
        const ip = this.config.ip || '192.168.0.1';
        const port = this.config.port || 8899;

        this.tcpClient = new net.Socket();
        this.tcpClient.setNoDelay(true);
        this.tcpClient.setTimeout(60000);
        this.tcpClient.connect(port, ip, () => this.log.info(`[연결 성공] EW11 (${ip}:${port})`));

        this.pendingOpen = false;
        const sequenceEndTrigger = 'bc71000001'; // Last Sequence

        this.tcpClient.on('data', (data) => {
            const hexChunk = data.toString('hex').toLowerCase();
            this.dataBuffer += hexChunk;

            if (this.config.debugMode) this.log.debug(`[RAW DATA]: ${hexChunk}`);

            if (this.targetBellPacket && this.dataBuffer.includes(this.targetBellPacket)) {
                const now = Date.now();
                if (now - this.lastBellTime > this.bellCooldown) {
                    if (this.bell) this.bell.trigger();
                    this.lastBellTime = now;
                }
                this.dataBuffer = "";
            }

            if (this.pendingOpen && this.dataBuffer.includes(this.sequenceEndTrigger)) {
                this.fireBurst();
                this.pendingOpen = false;
                this.dataBuffer = "";
            }

            if (this.dataBuffer.length > 1000) this.dataBuffer = this.dataBuffer.slice(-500);
        });

        this.tcpClient.on('timeout', () => {
            this.log.warn('[Timeout] 소켓을 재연결합니다.');
            this.tcpClient.destroy();
        });
        this.tcpClient.on('error', (err) => this.log.error(`[TCP 에러] ${err.message}`));
        this.tcpClient.on('close', () => {
            this.log.warn('[연결 종료] 10초 후 재연결을 시도합니다.');
            setTimeout(() => this.connectToEW11(), 10000);
        });
    }

    async executeOpen() {
        if (this.pendingOpen) return;
        this.pendingOpen = true;

        this.openTimeout = setTimeout(() => {
            if (this.pendingOpen) {
                this.pendingOpen = false;
                this.log.warn('[Cancel] 5초 내에 트리거 패킷이 발견되지 않아 취소되었습니다.');
            }
        }, 5000);
    }

    async fireBurst() {
        if (this.openTimeout) clearTimeout(this.openTimeout);

        const packet = this.targetOpenPacket;
        const { delay, repeat, interval } = this.timing;

        if (delay > 0) await new Promise(res => setTimeout(res, delay));

        for (let i = 0; i < repeat; i++) {
            this.sendPacket(packet);
            if (i < repeat - 1) await new Promise(res => setTimeout(res, interval));
        }
    }

    sendPacket(packet) {
        if (this.tcpClient && !this.tcpClient.destroyed) {
            this.tcpClient.write(Buffer.from(packet, 'hex'));
            this.log.debug(`📤 패킷 전송: ${packet}`);
            return true;
        }
        this.log.error('[전송 실패] EW11 연결 확인 필요');
        return false;
    }
}