class DoorLockAccessory {
    constructor(log, config, api, accessory, platform) {
        this.log = log;
        this.config = config;
        this.accessory = accessory;
        this.platform = platform;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        this.lockState = 1; // Locked
        this.setupService();
    }

    setupService() {
        this.service = this.accessory.getService(this.Service.LockMechanism) ||
            this.accessory.addService(this.Service.LockMechanism, '현관문');

        this.service.getCharacteristic(this.Characteristic.LockTargetState)
            .onSet(this.handleLockSet.bind(this))
            .onGet(() => this.lockState);

        this.service.getCharacteristic(this.Characteristic.LockCurrentState)
            .onGet(() => this.lockState);

        // [핵심] 초인종 서비스와 자물쇠 서비스를 논리적으로 연결 (링크)
        const doorbell = this.accessory.getService(this.Service.Doorbell);
        if (doorbell) {
            doorbell.addLinkedService(this.service);
        }
    }

    async handleLockSet(value) {
        if (value === 0) {
            this.log.info('🔓 공동현관 개방 명령 실행');
            const packet = this.config.openPacket || 'AA550102000103';
            this.platform.sendPacket(packet);

            this.lockState = 0;
            this.service.updateCharacteristic(this.Characteristic.LockCurrentState, 0);

            // 3초 후 잠김 상태로 자동 복귀
            setTimeout(() => {
                this.lockState = 1;
                this.service.updateCharacteristic(this.Characteristic.LockCurrentState, 1);
                this.service.getCharacteristic(this.Characteristic.LockTargetState).updateValue(1);
            }, 3000);
        }
    }
}

module.exports = DoorLockAccessory;