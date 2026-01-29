class DoorLockAccessory {
    constructor(log, config, api, name, platform) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.platform = platform;

        this.name = name;
        this.displayName = name;
        this.lockState = 1;

        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        this.setupLockService();
    }

    setupLockService() {
        this.lockService = new this.Service.LockMechanism(this.name);

        this.lockService.getCharacteristic(this.Characteristic.LockTargetState)
            .onSet(this.handleLockSet.bind(this))
            .onGet(() => this.lockState);

        this.lockService.getCharacteristic(this.Characteristic.LockCurrentState)
            .onGet(() => this.lockState);
    }

    async handleLockSet(value) {
        if (value === 0) {
            this.log.info('🔓 문 열림 요청 전송');
            const packet = (this.config.openPacket || 'c7fcdcfe2bc7fcd4fc15').toLowerCase();

            this.platform.sendPacket(packet);
            setTimeout(() => this.platform.sendPacket(packet), 300);

            this.lockState = 0;
            this.lockService.updateCharacteristic(this.Characteristic.LockCurrentState, 0);

            setTimeout(() => {
                this.lockState = 1;
                this.lockService.updateCharacteristic(this.Characteristic.LockCurrentState, 1);
                this.lockService.updateCharacteristic(this.Characteristic.LockTargetState, 1);
            }, 3000);
        }
    }

    getServices() {
        const informationService = new this.Service.AccessoryInformation()
            .setCharacteristic(this.Characteristic.Manufacturer, 'Custom')
            .setCharacteristic(this.Characteristic.Model, 'Wallpad Lock')
            .setCharacteristic(this.Characteristic.SerialNumber, '192.168.0.79');

        return [informationService, this.lockService];
    }
}

module.exports = DoorLockAccessory;