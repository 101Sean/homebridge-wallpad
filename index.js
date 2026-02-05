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
        this.isLockPending = false;
        this.lockPendingTimeout = null;

        this.targetBellPacket = (this.config.bellPacket || '').toLowerCase().replace(/\s/g, '');
        this.targetOpenPacket = (this.config.openPacket || '').toLowerCase().replace(/\s/g, '');

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

        this.tcpClient.on('data', (data) => {
            const hexChunk = data.toString('hex').toLowerCase();
            this.dataBuffer += hexChunk;

            if (this.config.debugMode) this.log.debug(`[RAW DATA]: ${hexChunk}`);

            if (this.targetBellPacket && this.dataBuffer.includes(this.targetBellPacket)) {
                if (this.isLockPending) {
                    this.log.info('🎯 [하이재킹] 서버 신호 포착! 패킷 연사를 시작합니다.');
                    this.executeBurstOpen();
                    this.isLockPending = false;
                    if (this.lockPendingTimeout) clearTimeout(this.lockPendingTimeout);
                }

                const now = Date.now();
                if (now - this.lastBellTime > 5000) {
                    this.log.info('🔔 [호출 감지] 벨 호출!');
                    if (this.bell) this.bell.trigger();
                    this.lastBellTime = now;
                }
                this.dataBuffer = "";
            }

            if (this.dataBuffer.length > 2000) this.dataBuffer = this.dataBuffer.slice(-1000);
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

    async executeBurstOpen() {
        const packet = this.targetOpenPacket;
        const repeat = this.config.repeat || 100;
        const delay = this.config.delay || 10;

        for (let i = 0; i < repeat; i++) {
            this.sendPacket(packet);
            if (delay > 0) await new Promise(res => setTimeout(res, delay));
        }
    }

    requestOpen() {
        this.log.info('⏳ 문열림 예약: 서버 신호를 대기합니다...');
        this.isLockPending = true;

        if (this.lockPendingTimeout) clearTimeout(this.lockPendingTimeout);
        this.lockPendingTimeout = setTimeout(() => {
            if (this.isLockPending) {
                this.log.warn('⚠️ 서버 신호 감지 실패 (타임아웃)');
                this.isLockPending = false;
            }
        }, 10000);
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