const net = require('net');

module.exports = (api) => {
    api.registerAccessory('EW11DoorLock', EW11DoorLock);
};

class EW11DoorLock {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        this.lockState = 1;
        this.tcpClient = null;

        this.infoService = new this.Service.AccessoryInformation()
            .setCharacteristic(this.Characteristic.Manufacturer, 'Samsung-Wallpad')
            .setCharacteristic(this.Characteristic.Model, 'EW11-Root-Controller');

        this.lockService = new this.Service.LockMechanism(this.config.name || '공동현관문');

        this.lockService.getCharacteristic(this.Characteristic.LockTargetState)
            .onSet(this.handleLockTargetStateSet.bind(this))
            .onGet(() => this.lockState);

        this.lockService.getCharacteristic(this.Characteristic.LockCurrentState)
            .onGet(() => this.lockState);

        this.doorbellService = new this.Service.Doorbell((this.config.name || '공동현관문') + ' 벨');

        this.lockService.addLinkedService(this.doorbellService);

        this.connectToEW11();
    }

    connectToEW11() {
        const host = this.config.ip;
        const port = this.config.port || 8899;
        this.tcpClient = new net.Socket();

        this.tcpClient.connect(port, host, () => {
            this.log.info(`[TCP 연결 성공] EW11 감시 중: ${host}:${port}`);
        });

        this.tcpClient.on('data', (data) => {
            const hexData = data.toString('hex').toUpperCase();
            if (hexData.includes('AA55010108')) {
                this.log.info('🔔 벨 호출이 감지되었습니다. 홈킷 알림을 보냅니다.');
                this.doorbellService.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent)
                    .updateValue(this.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
            }
        });

        this.tcpClient.on('error', (err) => this.log.error(`[TCP 에러] ${err.message}`));
        this.tcpClient.on('close', () => {
            this.log.warn('[TCP 연결 종료] 10초 후 재시도...');
            setTimeout(() => this.connectToEW11(), 10000);
        });
    }

    async handleLockTargetStateSet(value) {
        if (value === this.Characteristic.LockTargetState.UNSECURED) {
            this.log.info('[명령] 공동현관 개방 패킷을 EW11로 전송합니다.');

            const openPacket = this.config.openPacket || 'AA550102000103';
            this.sendPacket(openPacket);

            this.lockState = 0;
            this.lockService.updateCharacteristic(this.Characteristic.LockCurrentState, 0);

            setTimeout(() => {
                this.lockState = 1;
                this.lockService.updateCharacteristic(this.Characteristic.LockCurrentState, 1);
                this.lockService.updateCharacteristic(this.Characteristic.LockTargetState, 1);
                this.log.info('[상태] 자물쇠 아이콘 잠김 복구');
            }, 3000);
        }
    }

    sendPacket(hex) {
        if (this.tcpClient && !this.tcpClient.destroyed) {
            this.tcpClient.write(Buffer.from(hex, 'hex'));
        } else {
            this.log.error('[실패] EW11 연결이 유효하지 않습니다.');
        }
    }

    getServices() {
        return [this.infoService, this.lockService, this.doorbellService];
    }
}