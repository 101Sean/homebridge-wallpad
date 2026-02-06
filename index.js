const dgram = require('dgram');
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
        this.udpSocket = null;
        this.dataBuffer = "";
        this.lastBellTime = 0;
        this.pendingOpen = false;

        this.bellCooldown = this.config.bellCooldown || 5000;
        this.targetBellPacket = (this.config.bellPacket || '').toLowerCase().replace(/\s/g, '');
        this.targetOpenPacket = (this.config.openPacket || '').toLowerCase().replace(/\s/g, '');
        this.sequenceEndTrigger = (this.config.sequenceEndTrigger || '').toLowerCase().replace(/\s/g, '');
        this.timing = this.config.timingSet || { interval: 0, repeat: 10, delay: 0 };

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

        this.udpSocket = dgram.createSocket('udp4');

        this.udpSocket.bind(port, () => {
            this.log.info(`[UDP 수신 시작] 우분투 포트 ${port} 바인딩 완료`);
        });

        this.udpSocket.on('message', (msg, rinfo) => {
            if (rinfo.address !== ip) return;

            const hexChunk = msg.toString('hex').toLowerCase();
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
                this.pendingOpen = false;
                this.fireBurstUDP();
                this.dataBuffer = "";
            }

            if (this.dataBuffer.length > 500) this.dataBuffer = this.dataBuffer.slice(-200);
        });

        this.udpSocket.on('error', (err) => {
            this.log.error(`[UDP 에러] ${err.message}`);
            this.udpSocket.close();
            setTimeout(() => this.connectToEW11(), 5000);
        });

        this.log.info(`[UDP 서버 대기 중] EW11 데이터 수신 준비 완료`);
    }

    async executeOpen() {
        if (this.pendingOpen) return;
        this.pendingOpen = true;
        this.log.info('[Wait] 호출 세션 트리거를 기다리는 중...');

        this.openTimeout = setTimeout(() => {
            if (this.pendingOpen) {
                this.pendingOpen = false;
                this.log.warn('[Cancel] 10초 내에 트리거가 발견되지 않았습니다.');
            }
        }, 10000);
    }

    fireBurstUDP() {
        if (this.openTimeout) clearTimeout(this.openTimeout);

        const packet = Buffer.from(this.targetOpenPacket, 'hex');
        const ip = this.config.ip;
        const port = this.config.port;
        const { delay, repeat, interval } = this.timing;

        const send = () => {
            for (let i = 0; i < repeat; i++) {
                this.udpSocket.send(packet, port, ip, (err) => {
                    if (err) this.log.error(`[전송 에러] ${err.message}`);
                });
            }
            this.log.info(`📤 UDP Burst 완료: ${this.targetOpenPacket} (${repeat}회)`);
        };

        if (delay > 0) {
            setTimeout(send, delay);
        } else {
            send();
        }
    }
}