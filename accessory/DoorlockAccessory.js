class DoorLockAccessory {
    constructor(log, config, api, accessory, platform) {
        this.log = log;
        this.config = config;
        this.accessory = accessory;
        this.platform = platform;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        this.lockState = 1; // Locked

        this.lockService = new this.Service.LockMechanism(this.name);
        this.lockService.getCharacteristic(this.Characteristic.LockTargetState)
            .onSet(this.handleLockSet.bind(this))
            .onGet(() => this.lockState);
        this.lockService.getCharacteristic(this.Characteristic.LockCurrentState)
            .onGet(() => this.lockState);
    }

    async handleLockSet(value) {
        if (value === 0) {
            this.log.info('🔓 문 열림 패킷 전송');
            this.platform.sendPacket(this.config.openPacket || 'AA550102000103');
            this.lockState = 0;
            this.lockService.updateCharacteristic(this.Characteristic.LockCurrentState, 0);
            setTimeout(() => {
                this.lockState = 1;
                this.lockService.updateCharacteristic(this.Characteristic.LockCurrentState, 1);
                this.lockService.getCharacteristic(this.Characteristic.LockTargetState).updateValue(1);
            }, 3000);
        }
    }

    getServices() {
        return [this.lockService];
    }
}

module.exports = DoorLockAccessory;