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

        const streamManagement = this.accessory.getService(this.Service.CameraRTPStreamManagement) ||
            this.accessory.addService(this.Service.CameraRTPStreamManagement, '카메라 스트림');

        const micService = this.accessory.getService(this.Service.Microphone) ||
            this.accessory.addService(this.Service.Microphone, '마이크');

        const speakerService = this.accessory.getService(this.Service.Speaker) ||
            this.accessory.addService(this.Service.Speaker, '스피커');

        this.log.info('[Service] 최신 규격 더미 스트림 서비스 초기화 완료');
    }

    trigger() {
        this.log.info('🔔 초인종 이벤트 발생!');
        this.service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent).updateValue(0);
    }
}

module.exports = DoorbellAccessory;