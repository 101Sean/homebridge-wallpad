class DoorbellAccessory {
    constructor(log, config, api, accessory) {
        this.log = log;
        this.accessory = accessory;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        this.setupService();
    }

    setupService() {
        // 기존 서비스가 있으면 재사용, 없으면 생성
        this.service = this.accessory.getService(this.Service.Doorbell) ||
            this.accessory.addService(this.Service.Doorbell, '초인종');

        // Stateless Switch 특성 추가
        this.service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent);
    }

    trigger() {
        this.log.info('🔔 초인종 이벤트 발생!');
        this.service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent).updateValue(0);
    }
}

module.exports = DoorbellAccessory;