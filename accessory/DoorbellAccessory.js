class DoorbellAccessory {
    constructor(log, config, api, accessory) {
        this.log = log;
        this.accessory = accessory;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        this.setupService();
    }

    setupService() {
        this.service = this.accessory.getService(this.Service.Doorbell) ||
            this.accessory.addService(this.Service.Doorbell, '초인종');

        this.service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent);
    }

    trigger() {
        this.log.info('🔔 초인종 이벤트 발생!');
        this.service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent).updateValue(0);
    }
}

module.exports = DoorbellAccessory;