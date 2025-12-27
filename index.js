const net = require('net');

module.exports = (api) => {
    api.registerPlatform('homebridge-wallpad', 'WallpadPlatform', WallpadPlatform);
};

class WallpadPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        if (!config) return;
    }

    accessories(callback) {
        const accessory = new WallpadAccessory(this.log, this.config, this.api);
        callback([accessory]);
    }
}

class WallpadAccessory {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        this.lockState = 1;
        this.tcpClient = null;

        this.setupServices();
        this.connectToEW11();
    }

    setupServices() {
        this.infoService = new this.Service.AccessoryInformation()
            .setCharacteristic(this.Characteristic.Manufacturer, 'Samsung-DIY')
            .setCharacteristic(this.Characteristic.Model, 'EW11-Child-Controller');

        this.lockService = new this.Service.LockMechanism(this.config.name || '공동현관문');

        this.lockService.getCharacteristic(this.Characteristic.LockTargetState)
            .onSet(this.handleLockTargetStateSet.bind(this))
            .onGet(() => this.lockState);

        this.lockService.getCharacteristic(this.Characteristic.LockCurrentState)
            .onGet(() => this.lockState);

        this.doorbellService = new this.Service.Doorbell((this.config.name || '공동현관문') + ' 벨');

        this.lockService.addLinkedService(this.doorbellService);
    }

    connectToEW11() {
        const host = this.config.ip;
        const port = this.config.port || 8899;
        this.tcpClient = new net.Socket();

        this.tcpClient.connect(port, host, () => {
            this.log.info(`[연결 성공] EW11 감시 시작: ${host}:${port}`);
        });

        this.tcpClient.on('data', (data) => {
            const hexData = data.toString('hex').toUpperCase();
            if (hexData.includes('AA55010108')) {
                this.log.info('🔔 벨 호출 감지! 아이폰으로 알림을 보냅니다.');
                this.doorbellService.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent)
                    .updateValue(0); // 0: SINGLE_PRESS
            }
        });

        this.tcpClient.on('error', (err) => {
            this.log.error(`[TCP 에러] ${err.message}`);
        });

        this.tcpClient.on('close', () => {
            this.log.warn('[TCP 연결 종료] 10초 후 재시도합니다.');
            setTimeout(() => this.connectToEW11(), 10000);
        });
    }

    async handleLockTargetStateSet(value) {
        if (value === 0) {
            this.log.info('[명령] 공동현관 개방 패킷 전송');
            const packet = this.config.openPacket || 'AA550102000103';

            if (this.tcpClient && !this.tcpClient.destroyed) {
                this.tcpClient.write(Buffer.from(packet, 'hex'));
            }

            this.lockState = 0;
            this.lockService.updateCharacteristic(this.Characteristic.LockCurrentState, 0);

            setTimeout(() => {
                this.lockState = 1;
                this.lockService.updateCharacteristic(this.Characteristic.LockCurrentState, 1);
                this.lockService.updateCharacteristic(this.Characteristic.LockTargetState, 1);
                this.log.info('[상태] 자물쇠 아이콘 잠김 상태로 복구');
            }, 3000);
        }
    }

    getServices() {
        return [this.infoService, this.lockService, this.doorbellService];
    }
}