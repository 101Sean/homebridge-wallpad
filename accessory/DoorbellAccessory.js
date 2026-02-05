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
            this.accessory.addService(this.Service.Doorbell, 'Bell');

        const streamManagement = this.accessory.getService(this.Service.CameraRTPStreamManagement) ||
            this.accessory.addService(this.Service.CameraRTPStreamManagement, 'Camera');

        const micService = this.accessory.getService(this.Service.Microphone) ||
            this.accessory.addService(this.Service.Microphone, 'Mic');

        const speakerService = this.accessory.getService(this.Service.Speaker) ||
            this.accessory.addService(this.Service.Speaker, 'Speaker');

        this.log.info('[DoorBell] 초기화 완료');
    }

    trigger() {
        this.log.info('[DoorBell] 이벤트 발생');
        this.service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent).updateValue(0);
    }
}

module.exports = DoorbellAccessory;