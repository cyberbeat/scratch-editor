const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const color = require('../../util/color');
const BLE = require('../../io/ble');
const MultiBLE = require('../../io/ble-multi');
const Base64Util = require('../../util/base64-util');
const MathUtil = require('../../util/math-util');
const RateLimiter = require('../../util/rateLimiter.js');
const log = require('../../util/log');

/**
 * Icon svg to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line @stylistic/max-len
const iconURI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAABYlAAAWJQFJUiTwAAAF8klEQVR4Ae2cbWxTVRjH/7ctbVc2tyEMNpWBk0VIkLcEjSAQgglTE5HEaKqJi1E/mbCP/dJA0kQbvzgTQ0Ki2T7V6AeYGoEPLJmGKPiyzZDwEpYJCHSbQIcbdLvres1zOa13Xbvdu2eTDp9fst329Lnn5XfPPfece7tphmFAmDkuccdDBDIRgUxEIBMRyEQEMhGBTEQgExHIRAQyEYFMRCATEchEBDIRgUxEIBMRyEQEMhGBTEQgExHIxMPNIByNVQBoBUDb7kgo2KTS9wBoUmFNkVCwW6U3A1gP4JJKHwxHY/S+WcW2RkLBVhV7AMAOAIMAGlWstbyOSCh4QMU2Uoy1PBVL+a7IqZu1vOZIKNg20/azBarGvKxebw9HY22RULADwBFLTBcATQnZl4lVEimN4ssteXQrQfstebQpmW1q30xshyqvxRLbofYnYW9ZYgeV8C5LLOWlzbTxM3ouHI7GPgSwWx3Z0syBSBku6IYnlTbM+uQenJQaMnKHDaqAFnDrcCFbl3G1defEjas0a4N/Vz10OybyvapfrSX1sjpo+WIz0ME7QL3djgtHPTAcjb2mepw/b2ZaGh5NL5RnofR8R99dIC5fHusK5JsrCUpm7TSx21XvbcwTNwnbAsPR2GcA3qaG+H0LsHlDPZ7fca/ujZ+cRW9/Em5vCXzlNVhQUjFpf/3OTSRvXkKJz43Xt1bh1S1LUeq/5+njQ9/iVmLIfL1ieRU2b1iFtavztXNu6TrTi8PfnYI67WdPoOp5przV9Y8iuHdb9rOW9uumPI+vDIElddBckztPOqVn5X36Xj1WVQeynx1sOWbK83jc2PviM/dFXIYNax9H55leXLoyYHsfWwI14JCRRx7x5ckBU1oheYQ+1G9u39lVM0Hej7+cR7w/Yb7e9+5LqChfaLvixcK088BwNNZkAOV02ubK6+odwt3RcfOULSSPGEveG48bNj08If3kqXPmdtO6unkpDzYn0u/TLxrzcumJJ80Ut79sygzoFF6/siw75mUYupOEpmnY0/A0pw33FTsCa+hX5oJhZXgkZb5zub2O20CnL7EwkPeCPm+wI7CEBvi5wuOZ36tJW7X3uGXJXAgxk8P4eNpRPEvgskqfuR0Z/BNGejxvDM3/5gs0pboWv+motqybCc+tqUCzz43kaBJ/X+2eMjZ3ClNsjIzo5ioknXZ2b4AlkKYltLJoaY9jOJm/B0KJbtg4c4F/XOmH3+dF9dLKbBo1OD6QQGV56YQ55ODtO0jcHkZ1VSX8/n9nB9S7RkZ1rFy+NG8ZR9s70TeQQKDEh7vJUdt1Y9/OopXFB2/WcbMpyOexE9mlFS21aLlHMmKHfzBl0QT/hV2bzM9oLXv0xG8YGR0zpdLEn6RT2k+/XjDzoLX2G3u3TZBLUyral/Z5qCyAK1f/sl2/or+IWNel1Eji3MWrpjyCZHWqdNrSe6ieSHFERl4mP+q5GehgHGvvRGal5XI5uzU47f3A/R99YTgdF2wXrmkolr9ToZ5NvTjT4yOhoC2T057CJM/r9WDxoqmXa07R9THcuDVcMO8bt4ag6ynULKvkFjWBTLl0ugZKvNlyqLeSQKfYGgOpgXt2b5zVhlzrS+Dr451YvKg0b95txztxvS8xZ+VuXFuLJ5+oNgV+9c3PuHDxGs6cu+w4v//9RJo6x5bN9UgbBo4cPY1U6j+cSD8orFvzGFYuX4KxsRQGbth6FCICc9m5dY05HtN46AQRqPB5PWjY+ZT5RnMwkxGBFh5ZVmle9Z3MrGbjwfqccrC1vajrV7QCaVCfS6qrJj96nQlFK5CujPRT7MgYyEQEMhGBTGwJpAW4kJ9pBbo0zbx70X7y7AOv8HxP3LyB4YTpb2cZBt2iqL3QEwf9zDbX+waLca439QMeC7a+YBmOxugLiM/OTt2yaOoMoO+H6LOcNwf6xusrthsh/7mIh1yFmYhAJiKQiQhkIgKZiEAmIpCJCGQiApmIQCYikIkIZCICmYhAJiKQiQhkIgKZiEAmIpCJCGQiAjkA+AeOwQKMcWZqHgAAAABJRU5ErkJggg==';

/**
 * A list of WeDo 2.0 BLE service UUIDs.
 * @enum
 */
const BLEService = {
    DEVICE_SERVICE: '00001523-1212-efde-1523-785feabcd123',
    IO_SERVICE: '00004f0e-1212-efde-1523-785feabcd123'
};

/**
 * A list of WeDo 2.0 BLE characteristic UUIDs.
 *
 * Characteristics on DEVICE_SERVICE:
 * - ATTACHED_IO
 *
 * Characteristics on IO_SERVICE:
 * - INPUT_VALUES
 * - INPUT_COMMAND
 * - OUTPUT_COMMAND
 * @enum
 */
const BLECharacteristic = {
    ATTACHED_IO: '00001527-1212-efde-1523-785feabcd123',
    LOW_VOLTAGE_ALERT: '00001528-1212-efde-1523-785feabcd123',
    INPUT_VALUES: '00001560-1212-efde-1523-785feabcd123',
    INPUT_COMMAND: '00001563-1212-efde-1523-785feabcd123',
    OUTPUT_COMMAND: '00001565-1212-efde-1523-785feabcd123'
};

/**
 * A time interval to wait (in milliseconds) in between battery check calls.
 * @type {number}
 */
const BLEBatteryCheckInterval = 5000;

/**
 * A time interval to wait (in milliseconds) while a block that sends a BLE message is running.
 * @type {number}
 */
const BLESendInterval = 100;

/**
 * A maximum number of BLE message sends per second, to be enforced by the rate limiter.
 * @type {number}
 */
const BLESendRateMax = 20;

/**
 * Enum for WeDo 2.0 sensor and output types.
 * @readonly
 * @enum {number}
 */
const WeDo2Device = {
    MOTOR: 1,
    VOLTAGE: 20,
    CURRENT: 21,
    PIEZO: 22,
    LED: 23,
    TILT: 34,
    DISTANCE: 35
};

/**
 * Enum for connection/port ids assigned to internal WeDo 2.0 output devices.
 * @readonly
 * @enum {number}
 */
// TODO: Check for these more accurately at startup?
const WeDo2ConnectID = {
    LED: 6,
    PIEZO: 5
};

/**
 * Enum for ids for various output commands on the WeDo 2.0.
 * @readonly
 * @enum {number}
 */
const WeDo2Command = {
    MOTOR_POWER: 1,
    PLAY_TONE: 2,
    STOP_TONE: 3,
    WRITE_RGB: 4,
    SET_VOLUME: 255
};

/**
 * Enum for modes for input sensors on the WeDo 2.0.
 * @enum {number}
 */
const WeDo2Mode = {
    TILT: 0, // angle
    DISTANCE: 0, // detect
    LED: 1 // RGB
};

/**
 * Enum for units for input sensors on the WeDo 2.0.
 *
 * 0 = raw
 * 1 = percent
 * @enum {number}
 */
const WeDo2Unit = {
    TILT: 0,
    DISTANCE: 1,
    LED: 0
};

/**
 * Manage power, direction, and timers for one WeDo 2.0 motor.
 */
class WeDo2Motor {
    /**
     * Construct a WeDo 2.0 Motor instance.
     * @param {WeDo2} parent - the WeDo 2.0 peripheral which owns this motor.
     * @param {int} index - the zero-based index of this motor on its parent peripheral.
     */
    constructor (parent, index) {
        /**
         * The WeDo 2.0 peripheral which owns this motor.
         * @type {WeDo2}
         * @private
         */
        this._parent = parent;

        /**
         * The zero-based index of this motor on its parent peripheral.
         * @type {int}
         * @private
         */
        this._index = index;

        /**
         * This motor's current direction: 1 for "this way" or -1 for "that way"
         * @type {number}
         * @private
         */
        this._direction = 1;

        /**
         * This motor's current power level, in the range [0,100].
         * @type {number}
         * @private
         */
        this._power = 100;

        /**
         * Is this motor currently moving?
         * @type {boolean}
         * @private
         */
        this._isOn = false;

        /**
         * If the motor has been turned on or is actively braking for a specific duration, this is the timeout ID for
         * the end-of-action handler. Cancel this when changing plans.
         * @type {object}
         * @private
         */
        this._pendingTimeoutId = null;

        /**
         * The starting time for the pending timeout.
         * @type {object}
         * @private
         */
        this._pendingTimeoutStartTime = null;

        /**
         * The delay/duration of the pending timeout.
         * @type {object}
         * @private
         */
        this._pendingTimeoutDelay = null;

        this.startBraking = this.startBraking.bind(this);
        this.turnOff = this.turnOff.bind(this);

        /**
         * Send function for this motor. Defaults to parent send, but can be
         * overridden for per-device targeting in multi-hub setups.
         * @type {Function}
         * @private
         */
        this.send = (uuid, message, useLimiter = true) => {
            // log.info('[WeDo2Motor] send (default)', {index: this._index, uuid, message, useLimiter});
            return this._parent.send(uuid, message, useLimiter);
        };

        // log.info('[WeDo2Motor] created', {index: this._index});
    }

    /**
     * @returns {number} - the duration of active braking after a call to startBraking(). Afterward, turn the motor off.
     * @class
     */
    static get BRAKE_TIME_MS () {
        return 1000;
    }

    /**
     * @returns {int} - this motor's current direction: 1 for "this way" or -1 for "that way"
     */
    get direction () {
        return this._direction;
    }

    /**
     * @param {int} value - this motor's new direction: 1 for "this way" or -1 for "that way"
     */
    set direction (value) {
        if (value < 0) {
            this._direction = -1;
        } else {
            this._direction = 1;
        }
    }

    /**
     * @returns {int} - this motor's current power level, in the range [0,100].
     */
    get power () {
        return this._power;
    }

    /**
     * @param {int} value - this motor's new power level, in the range [0,100].
     */
    set power (value) {
        const p = Math.max(0, Math.min(value, 100));
        // WeDo 2.0 hubs (firmware >= 1.0) add a power offset of 35 to ensure the motor
        // starts at low power settings, clamped to the hub's maximum of 100.
        if (p === 0) {
            this._power = 0;
        } else {
            this._power = Math.min(100, p + 35);
        }
        // log.info('[WeDo2Motor] set power', {index: this._index, value, p, power: this._power});
    }

    /**
     * @returns {boolean} - true if this motor is currently moving, false if this motor is off or braking.
     */
    get isOn () {
        return this._isOn;
    }

    /**
     * @returns {boolean} - time, in milliseconds, of when the pending timeout began.
     */
    get pendingTimeoutStartTime () {
        return this._pendingTimeoutStartTime;
    }

    /**
     * @returns {boolean} - delay, in milliseconds, of the pending timeout.
     */
    get pendingTimeoutDelay () {
        return this._pendingTimeoutDelay;
    }

    /**
     * Turn this motor on indefinitely.
     */
    turnOn () {
        if (this._power === 0) {
            // Power 0 means "stopped": make sure the stop actually reaches the
            // hub instead of leaving the motor at its last commanded power.
            this.turnOff();
            return;
        }

        const value = this._power * this._direction;
        const cmd = this._parent.generateOutputCommand(
            this._index + 1,
            WeDo2Command.MOTOR_POWER,
            [value] // power in range 0-100
        );

        log.info('[WeDo2Motor] turnOn', {index: this._index, power: this._power, direction: this._direction, value, cmd});
        this.send(BLECharacteristic.OUTPUT_COMMAND, cmd)
            .then(() => { log.info('[WeDo2Motor] turnOn sent', this._index); })
            .catch(err => console.error('[WeDo2Motor] turnOn send failed', this._index, err));

        this._isOn = true;
        this._clearTimeout();
    }

    /**
     * Turn this motor on for a specific duration.
     * @param {number} milliseconds - run the motor for this long.
     */
    turnOnFor (milliseconds) {
        if (this._power === 0) {
            this.turnOff();
            return;
        }

        milliseconds = Math.max(0, milliseconds);
        log.info('[WeDo2Motor] turnOnFor', {index: this._index, milliseconds});
        this.turnOn();
        this._setNewTimeout(this.startBraking, milliseconds);
    }

    /**
     * Start active braking on this motor. After a short time, the motor will turn off.
     */
    startBraking () {
        const cmd = this._parent.generateOutputCommand(
            this._index + 1,
            WeDo2Command.MOTOR_POWER,
            [127] // 127 = break
        );

        // log.info('[WeDo2Motor] startBraking', {index: this._index, cmd});
        this.send(BLECharacteristic.OUTPUT_COMMAND, cmd)
            .then(() => { /* // log.info('[WeDo2Motor] startBraking sent', this._index); */ })
            .catch(err => console.error('[WeDo2Motor] startBraking send failed', this._index, err));

        this._isOn = false;
        this._setNewTimeout(this.turnOff, WeDo2Motor.BRAKE_TIME_MS);
    }

    /**
     * Turn this motor off.
     * @param {boolean} [useLimiter] - if true, use the rate limiter
     */
    turnOff (useLimiter = true) {
        const cmd = this._parent.generateOutputCommand(
            this._index + 1,
            WeDo2Command.MOTOR_POWER,
            [0] // 0 = stop
        );

        // log.info('[WeDo2Motor] turnOff', {index: this._index, useLimiter, cmd});
        this.send(BLECharacteristic.OUTPUT_COMMAND, cmd, useLimiter)
            .then(() => { /* // log.info('[WeDo2Motor] turnOff sent', this._index); */ })
            .catch(err => console.error('[WeDo2Motor] turnOff send failed', this._index, err));

        this._isOn = false;
        this._clearTimeout();
    }

    /**
     * Clear the motor action timeout, if any. Safe to call even when there is no pending timeout.
     * @private
     */
    _clearTimeout () {
        if (this._pendingTimeoutId !== null) {
            clearTimeout(this._pendingTimeoutId);
            this._pendingTimeoutId = null;
            this._pendingTimeoutStartTime = null;
            this._pendingTimeoutDelay = null;
        }
    }

    /**
     * Set a new motor action timeout, after clearing an existing one if necessary.
     * @param {Function} callback - to be called at the end of the timeout.
     * @param {int} delay - wait this many milliseconds before calling the callback.
     * @private
     */
    _setNewTimeout (callback, delay) {
        this._clearTimeout();
        const timeoutID = setTimeout(() => {
            if (this._pendingTimeoutId === timeoutID) {
                this._pendingTimeoutId = null;
                this._pendingTimeoutStartTime = null;
                this._pendingTimeoutDelay = null;
            }
            callback();
        }, delay);
        this._pendingTimeoutId = timeoutID;
        this._pendingTimeoutStartTime = Date.now();
        this._pendingTimeoutDelay = delay;
    }
}

/**
 * Manage communication with a WeDo 2.0 peripheral over a Bluetooth Low Energy client socket.
 */
class WeDo2 {

    constructor (runtime, extensionId, getInfo = null) {

        /**
         * The Scratch 3.0 runtime used to trigger the green flag button.
         * @type {Runtime}
         * @private
         */
        this._runtime = runtime;
        this._runtime.on('PROJECT_STOP_ALL', this.stopAll.bind(this));

        /**
         * Callback to retrieve the latest extension info for refreshing block menus.
         * @type {Function|null}
         * @private
         */
        this._getInfo = getInfo;

        /**
         * The id of the extension this peripheral belongs to.
         */
        this._extensionId = extensionId;

        /**
         * MultiBLE instance for managing multiple WeDo 2.0 hubs.
         * @type {MultiBLE}
         * @private
         */
        this._multiBLE = null;

        /**
         * Global registry of all motors across all hubs.
         * Maps global motor ID to {deviceId, motorIndex, motorInstance}
         * @type {Map<number, {deviceId: string, motorIndex: number, motorInstance: WeDo2Motor}>}
         * @private
         */
        this._globalMotors = new Map();

        /**
         * Global registry of all sensors across all hubs.
         * Maps global sensor ID to {deviceId, portIndex, type, value}
         * @type {Map<number, {deviceId: string, portIndex: number, type: number, value: any}>}
         * @private
         */
        this._globalSensors = new Map();

        /**
         * Port states for each device: deviceId -> ['none', 'none']
         * @type {Map<string, string[]>}
         * @private
         */
        this._devicePorts = new Map();

        /**
         * Legacy compatibility: sensors for single hub access
         * @type {Object.<string, number>}
         * @private
         */
        this._sensors = {
            tiltX: 0,
            tiltY: 0,
            distance: 0
        };

        this._runtime.registerPeripheralExtension(extensionId, this);

        /**
         * Rate limiters per device, to help limit the rate at which we send BLE messages
         * over each device's socket to Scratch Link to a maximum number of sends per second.
         * @type {Map<string, RateLimiter>}
         * @private
         */
        this._rateLimiters = new Map();

        /**
         * Battery check intervals for each device
         * @type {Map<string, number>}
         * @private
         */
        this._batteryLevelIntervals = new Map();

        this.reset = this.reset.bind(this);
        this._onConnect = this._onConnect.bind(this);
        this._onMessage = this._onMessage.bind(this);
        this._checkBatteryLevel = this._checkBatteryLevel.bind(this);
    }

    /**
     * @returns {number} - the latest value received for the tilt sensor's tilt about the X axis.
     */
    get tiltX () {
        // Return value from first available tilt sensor for legacy compatibility
        for (const [sensorId, sensorData] of this._globalSensors) {
            if (sensorData.type === WeDo2Device.TILT) {
                return sensorData.value.tiltX || 0;
            }
        }
        return this._sensors.tiltX;
    }

    /**
     * @returns {number} - the latest value received for the tilt sensor's tilt about the Y axis.
     */
    get tiltY () {
        // Return value from first available tilt sensor for legacy compatibility
        for (const [sensorId, sensorData] of this._globalSensors) {
            if (sensorData.type === WeDo2Device.TILT) {
                return sensorData.value.tiltY || 0;
            }
        }
        return this._sensors.tiltY;
    }

    /**
     * @returns {number} - the latest value received from the distance sensor.
     */
    get distance () {
        // Return value from first available distance sensor for legacy compatibility
        for (const [sensorId, sensorData] of this._globalSensors) {
            if (sensorData.type === WeDo2Device.DISTANCE) {
                return sensorData.value || 0;
            }
        }
        return this._sensors.distance;
    }

    /**
     * Get a list of all available motors with their global IDs and labels.
     * @returns {Array<{id: number, label: string}>} - array of motor info
     */
    getAvailableMotors () {
        const motors = [];
        for (const [globalId, motorData] of this._globalMotors) {
            const label = this._getMotorLabel(globalId);
            motors.push({ id: globalId, label });
        }
        // log.info('[WeDo2] getAvailableMotors:', motors);
        return motors;
    }

    /**
     * Get a list of all available sensors with their global IDs and labels.
     * @returns {Array<{id: number, label: string, type: number}>} - array of sensor info
     */
    getAvailableSensors () {
        const sensors = [];
        for (const [globalId, sensorData] of this._globalSensors) {
            const label = this._getSensorLabel(globalId, sensorData.type);
            sensors.push({ id: globalId, label, type: sensorData.type });
        }
        return sensors;
    }

    /**
     * Get motor label based on global ID (A, B, C, D, ...)
     * @param {number} globalId - the global motor ID
     * @returns {string} - the motor label
     * @private
     */
    _getMotorLabel (globalId) {
        const label = String.fromCharCode(65 + globalId); // 65 = 'A'
        return `motor ${label}`;
    }

    /**
     * Get sensor label based on global ID and type
     * @param {number} globalId - the global sensor ID
     * @param {number} type - the sensor type
     * @returns {string} - the sensor label
     * @private
     */
    _getSensorLabel (globalId, type) {
        // Always use the lowest free letter in this sensor category
        let typeIndex = 0;
        for (const [id, data] of this._globalSensors) {
            if (data.type === type && id < globalId) {
                typeIndex++;
            }
        }
        const label = String.fromCharCode(65 + typeIndex); // 65 = 'A'
        if (type === WeDo2Device.TILT) {
            return `tilt sensor ${label}`;
        } else if (type === WeDo2Device.DISTANCE) {
            return `distance sensor ${label}`;
        }
        return `sensor ${label}`;
    }

    /**
     * Access a particular motor by global ID.
     * @param {number} globalId - the global ID of the desired motor.
     * @returns {WeDo2Motor} - the WeDo2Motor instance, if any.
     */
    motor (globalId) {
        const motorData = this._globalMotors.get(globalId);
        return motorData ? motorData.motorInstance : null;
    }

    /**
     * Access sensor data by global ID.
     * @param {number} globalId - the global ID of the desired sensor.
     * @returns {Object} - the sensor data, if any.
     */
    getSensor (globalId) {
        return this._globalSensors.get(globalId);
    }

    /**
     * Stop all the motors that are currently running.
     */
    stopAllMotors () {
        for (const [globalId, motorData] of this._globalMotors) {
            if (motorData.motorInstance) {
                // Send the motor off command without using the rate limiter.
                // This allows the stop button to stop motors even if we are
                // otherwise flooded with commands.
                motorData.motorInstance.turnOff(false);
            }
        }
    }

    /**
     * Set the WeDo 2.0 peripheral's LED to a specific color on all connected devices.
     * @param {int} inputRGB - a 24-bit RGB color in 0xRRGGBB format.
     * @returns {Promise} - a promise of the completion of the set led send operation.
     */
    setLED (inputRGB) {
        const promises = [];
        for (const [deviceId] of this._devicePorts) {
            promises.push(this.setLEDOnDevice(deviceId, inputRGB));
        }
        return Promise.all(promises);
    }

    /**
     * Set the WeDo 2.0 peripheral's LED to a specific color on a specific device.
     * @param {string} deviceId - the device ID to set the LED on.
     * @param {int} inputRGB - a 24-bit RGB color in 0xRRGGBB format.
     * @returns {Promise} - a promise of the completion of the set led send operation.
     */
    setLEDOnDevice (deviceId, inputRGB) {
        if (!this._multiBLE || !this._multiBLE.isConnected(deviceId)) return Promise.resolve();

        const rgb = [
            (inputRGB >> 16) & 0x000000FF,
            (inputRGB >> 8) & 0x000000FF,
            (inputRGB) & 0x000000FF
        ];

        const cmd = this.generateOutputCommand(
            WeDo2ConnectID.LED,
            WeDo2Command.WRITE_RGB,
            rgb
        );

        return this.sendToDevice(deviceId, BLECharacteristic.OUTPUT_COMMAND, cmd);
    }

    /**
     * Sets the input mode of the LED to RGB on all connected devices.
     * @returns {Promise} - a promise returned by the send operation.
     */
    setLEDMode () {
        const promises = [];
        for (const [deviceId, ports] of this._devicePorts) {
            if (this._multiBLE && this._multiBLE.isConnected(deviceId)) {
                const cmd = this.generateInputCommand(
                    WeDo2ConnectID.LED,
                    WeDo2Device.LED,
                    WeDo2Mode.LED,
                    0,
                    WeDo2Unit.LED,
                    false
                );
                promises.push(this.sendToDevice(deviceId, BLECharacteristic.INPUT_COMMAND, cmd));
            }
        }
        return Promise.all(promises);
    }

    /**
     * Switch off the LED on all connected WeDo 2.0 devices.
     * @returns {Promise} - a promise of the completion of the stop led send operation.
     */
    stopLED () {
        const promises = [];
        for (const [deviceId, ports] of this._devicePorts) {
            if (this._multiBLE && this._multiBLE.isConnected(deviceId)) {
                const cmd = this.generateOutputCommand(
                    WeDo2ConnectID.LED,
                    WeDo2Command.WRITE_RGB,
                    [0, 0, 0]
                );
                promises.push(this.sendToDevice(deviceId, BLECharacteristic.OUTPUT_COMMAND, cmd));
            }
        }
        return Promise.all(promises);
    }

    /**
     * Play a tone from all connected WeDo 2.0 peripherals for a specific amount of time.
     * @param {int} tone - the pitch of the tone, in Hz.
     * @param {int} milliseconds - the duration of the note, in milliseconds.
     * @returns {Promise} - a promise of the completion of the play tone send operation.
     */
    playTone (tone, milliseconds) {
        const promises = [];
        for (const [deviceId] of this._devicePorts) {
            promises.push(this.playToneOnDevice(deviceId, tone, milliseconds));
        }
        return Promise.all(promises);
    }

    /**
     * Play a tone on a specific WeDo 2.0 device for a specific amount of time.
     * @param {string} deviceId - the device ID to play the tone on.
     * @param {int} tone - the pitch of the tone, in Hz.
     * @param {int} milliseconds - the duration of the note, in milliseconds.
     * @returns {Promise} - a promise of the completion of the play tone send operation.
     */
    playToneOnDevice (deviceId, tone, milliseconds) {
        if (!this._multiBLE || !this._multiBLE.isConnected(deviceId)) return Promise.resolve();

        const t = Math.min(Math.max(Math.round(tone), 0), 1500);
        const ms = Math.min(Math.max(Math.round(milliseconds), 0), 65536);
        // log.info('[WeDo2] playToneOnDevice', {deviceId, t, ms});
        const cmd = this.generateOutputCommand(
            WeDo2ConnectID.PIEZO,
            WeDo2Command.PLAY_TONE,
            [
                t,
                t >> 8,
                ms,
                ms >> 8
            ]
        );

        return this.sendToDevice(deviceId, BLECharacteristic.OUTPUT_COMMAND, cmd);
    }

    /**
     * Stop the tone playing from all connected WeDo 2.0 peripherals, if any.
     * @returns {Promise} - a promise that the command sent.
     */
    stopTone () {
        const promises = [];
        for (const [deviceId, ports] of this._devicePorts) {
            if (this._multiBLE && this._multiBLE.isConnected(deviceId)) {
                const cmd = this.generateOutputCommand(
                    WeDo2ConnectID.PIEZO,
                    WeDo2Command.STOP_TONE
                );
                // log.info('[WeDo2] stopTone', {deviceId, cmd});
                // Send this command without using the rate limiter, because it is
                // only triggered by the stop button.
                promises.push(this.sendToDevice(deviceId, BLECharacteristic.OUTPUT_COMMAND, cmd, false));
            }
        }
        return Promise.all(promises);
    }

    /**
     * Stop the tone playing and motors on the WeDo 2.0 peripheral.
     */
    stopAll () {
        if (!this.isConnected()) return;
        // log.info('[WeDo2] stopAll');
        this.stopTone();
        this.stopAllMotors();
    }

    /**
     * Called by the runtime when user wants to scan for WeDo 2.0 peripherals.
     * Bestehende Verbindungen bleiben erhalten – es wird nur (erneut) gescannt.
     */
    scan () {
        if (this._multiBLE) {
            // Reuse the existing MultiBLE so connected hubs stay connected
            this._multiBLE.startDiscovery();
            return;
        }

        // Create new MultiBLE instance for scanning
        this._multiBLE = new MultiBLE(
            this._runtime,
            this._extensionId,
            {
                filters: [{
                    services: [BLEService.DEVICE_SERVICE]
                }],
                optionalServices: [BLEService.IO_SERVICE]
            },
            this._onConnect,
            this.reset
        );
    }

    /**
     * Stop scanning for peripherals without dropping existing connections.
     * Called by the runtime when the connection dialog is closed.
     */
    stopScan () {
        if (this._multiBLE) {
            this._multiBLE.stopDiscovery();
        }
    }

    /**
     * Called by the runtime when user wants to connect to a certain WeDo 2.0 peripheral.
     * @param {string} id - the id of the peripheral to connect to.
     */
    connect (id) {
        if (this._multiBLE) {
            this._multiBLE.connectPeripheral(id);
        }
    }

    /**
     * Disconnects from one WeDo 2.0 peripheral, or – without deviceId – from all BLE sockets.
     * @param {string} [deviceId] - the id of a single peripheral to disconnect.
     */
    disconnect (deviceId = null) {
        if (deviceId) {
            if (this._multiBLE) {
                // Disconnects the device and cleans up its state via the resetCallback
                this._multiBLE.disconnect(deviceId);
            } else {
                this.reset(deviceId);
            }
            return;
        }

        if (this._multiBLE) {
            this._multiBLE.disconnect();
        }

        this.reset();
    }

    /**
     * Reset all the state and timeout/interval ids – or only the state of one device.
     * @param {string} [deviceId] - if given, only this device's state is cleaned up.
     */
    reset (deviceId = null) {
        if (deviceId) {
            // Per-device cleanup: remove this device's ports/motors/sensors
            const ports = this._devicePorts.get(deviceId);
            if (ports) {
                for (let i = 0; i < ports.length; i++) {
                    if (ports[i] !== 'none') {
                        this._clearPort(i + 1, deviceId);
                    }
                }
            }
            this._devicePorts.delete(deviceId);

            if (this._batteryLevelIntervals.has(deviceId)) {
                window.clearInterval(this._batteryLevelIntervals.get(deviceId));
                this._batteryLevelIntervals.delete(deviceId);
            }
            this._rateLimiters.delete(deviceId);
            return;
        }

        // Clear all global device registries
        this._globalMotors.clear();
        this._globalSensors.clear();
        this._devicePorts.clear();

        // Clear all battery check intervals
        for (const intervalId of this._batteryLevelIntervals.values()) {
            window.clearInterval(intervalId);
        }
        this._batteryLevelIntervals.clear();

        // Clear per-device rate limiters
        this._rateLimiters.clear();

        // Reset legacy sensors
        this._sensors = {
            tiltX: 0,
            tiltY: 0,
            distance: 0
        };
    }

    /**
     * Called by the runtime to detect whether any WeDo 2.0 peripheral is connected.
     * @returns {boolean} - the connected state.
     */
    isConnected () {
        if (this._multiBLE) {
            return this._multiBLE.isConnected();
        }
        return false;
    }

    /**
     * Get the number of connected devices.
     * @returns {number} - the number of connected devices.
     */
    getConnectedDeviceCount () {
        if (this._multiBLE) {
            // Count connected devices by checking device ports
            return this._devicePorts.size;
        }
        return 0;
    }

    /**
     * Get list of connected devices with their IDs and labels.
     * @returns {Array} - array of {deviceId, label} objects.
     */
    getConnectedDevices () {
        // log.info('[WeDo2] getConnectedDevices, _multiBLE connected:',
        //     this._multiBLE ? this._multiBLE.isConnected() : 'no multiBLE');
        const devices = [];
        let index = 1;
        for (const [deviceId, ports] of this._devicePorts) {
            devices.push({
                deviceId,
                label: `Device ${index}`
            });
            index++;
        }
        return devices;
    }

    /**
     * Returns the IDs of all currently connected WeDo 2.0 peripherals.
     * @returns {Array<string>} - connected peripheral IDs.
     */
    getConnectedPeripheralIds () {
        if (this._multiBLE) {
            return this._multiBLE.getConnectedDeviceIds();
        }
        return [];
    }

    /**
     * Ensures that exactly the provided set of peripherals is connected.
     * @param {Array<string>} peripheralIds - IDs of peripherals that should remain connected.
     */
    setConnectedPeripheralIds (peripheralIds) {
        // log.info('[WeDo2] setConnectedPeripheralIds', peripheralIds);
        if (this._multiBLE) {
            this._multiBLE.setConnectedPeripherals(peripheralIds);
        }
    }

    /**
     * Write a message to a specific WeDo 2.0 device's BLE socket.
     * @param {string} deviceId - the device ID to send to
     * @param {number} uuid - the UUID of the characteristic to write to
     * @param {Array} message - the message to write.
     * @param {boolean} [useLimiter] - if true, use the rate limiter
     * @param {boolean} [withResponse] - if true, wait for a response (WeDo 2.0 output commands need this)
     * @returns {Promise} - a promise result of the write operation
     */
    sendToDevice (deviceId, uuid, message, useLimiter = true, withResponse = true) {
        log.info('[WeDo2] sendToDevice', {deviceId, uuid, message, useLimiter, withResponse});
        if (!this._multiBLE || !this._multiBLE.isConnected(deviceId)) {
            console.warn('[WeDo2] sendToDevice: not connected', deviceId);
            return Promise.resolve();
        }

        if (useLimiter) {
            if (!this._rateLimiters.has(deviceId)) {
                this._rateLimiters.set(deviceId, new RateLimiter(BLESendRateMax));
            }
            const rateLimiter = this._rateLimiters.get(deviceId);
            if (!rateLimiter.okayToSend()) {
                console.warn('[WeDo2] sendToDevice: rate limited', deviceId);
                return Promise.resolve();
            }
        }

        const base64 = Base64Util.uint8ArrayToBase64(message);
        log.info('[WeDo2] sendToDevice writing', {deviceId, uuid, base64, withResponse});
        return this._multiBLE.write(
            deviceId,
            BLEService.IO_SERVICE,
            uuid,
            base64,
            'base64',
            withResponse
        ).catch(err => {
            console.error('[WeDo2] sendToDevice write failed', deviceId, uuid, err);
            throw err;
        });
    }

    /**
     * Write a message to the first connected WeDo 2.0 peripheral BLE socket (legacy compatibility).
     * @param {number} uuid - the UUID of the characteristic to write to
     * @param {Array} message - the message to write.
     * @param {boolean} [useLimiter] - if true, use the rate limiter
     * @returns {Promise} - a promise result of the write operation
     */
    send (uuid, message, useLimiter = true) {
        // Send to all connected devices for backward compatibility
        // log.info('[WeDo2] send', {uuid, message, useLimiter});
        const promises = [];
        for (const [deviceId, ports] of this._devicePorts) {
            promises.push(
                this.sendToDevice(deviceId, uuid, message, useLimiter)
                    .then(() => { /* // log.info('[WeDo2] send success', deviceId, uuid, message); */ })
                    .catch(err => console.error('[WeDo2] send failed', deviceId, uuid, message, err))
            );
        }
        return Promise.all(promises);
    }

    /**
     * Generate a WeDo 2.0 'Output Command' in the byte array format
     * (CONNECT ID, COMMAND ID, NUMBER OF BYTES, VALUES ...).
     *
     * This sends a command to the WeDo 2.0 to actuate the specified outputs.
     * @param  {number} connectID - the port (Connect ID) to send a command to.
     * @param  {number} commandID - the id of the byte command.
     * @param  {Array}  values    - the list of values to write to the command.
     * @returns {Array}            - a generated output command.
     */
    generateOutputCommand (connectID, commandID, values = null) {
        const payload = values || [];
        return [connectID, commandID, payload.length].concat(payload);
    }

    /**
     * Generate a WeDo 2.0 'Input Command' in the byte array format
     * (COMMAND ID, COMMAND TYPE, CONNECT ID, TYPE ID, MODE, DELTA INTERVAL (4 BYTES),
     * UNIT, NOTIFICATIONS ENABLED).
     *
     * This sends a command to the WeDo 2.0 that sets that input format
     * of the specified inputs and sets value change notifications.
     * @param  {number}  connectID           - the port (Connect ID) to send a command to.
     * @param  {number}  type                - the type of input sensor.
     * @param  {number}  mode                - the mode of the input sensor.
     * @param  {number}  delta               - the delta change needed to trigger notification.
     * @param  {Array}   units               - the unit of the input sensor value.
     * @param  {boolean} enableNotifications - whether to enable notifications.
     * @returns {Array}                       - a generated input command.
     */
    generateInputCommand (connectID, type, mode, delta, units, enableNotifications) {
        const command = [
            1, // Command ID = 1 = "Sensor Format"
            2, // Command Type = 2 = "Write"
            connectID,
            type,
            mode,
            delta,
            0, // Delta Interval Byte 2
            0, // Delta Interval Byte 3
            0, // Delta Interval Byte 4
            units,
            enableNotifications ? 1 : 0
        ];

        return command;
    }

    /**
     * Sets LED mode and initial color and starts reading data from peripheral after BLE has connected.
     * @param {string} deviceId - the device ID that connected
     * @private
     */
    _onConnect (deviceId) {
        log.info('[WeDo2] _onConnect', deviceId);
        // Initialize port state for this device
        if (!this._devicePorts.has(deviceId)) {
            this._devicePorts.set(deviceId, ['none', 'none']);
        }

        // Set up LED and start notifications for this device
        this.setLEDMode();
        this.setLED(0x0000FF);

        if (this._multiBLE) {
            this._multiBLE.startNotifications(
                deviceId,
                BLEService.DEVICE_SERVICE,
                BLECharacteristic.ATTACHED_IO,
                (data, characteristicId) => this._onMessage(data, deviceId, characteristicId)
            ).then(() => {
                log.info('[WeDo2] ATTACHED_IO notifications started for', deviceId);
                // Some hubs do not reliably send the attach table on the first
                // subscribe (device was plugged in before the BLE link came up).
                // If no port is known after a short wait, re-subscribing
                // re-triggers the table.
                window.setTimeout(() => this._refreshPortTable(deviceId), 1500);
            }).catch(err => {
                // A real ATT access fails on a dead link
                // (e.g. a BlueZ zombie connect to a powered-off device).
                console.error('[WeDo2] ATTACHED_IO init failed', deviceId, err);
                this.disconnect(deviceId);
            });
        }

        // Update block menus to show the connected device


        // Start battery check for this device
        const intervalId = window.setInterval(() => this._checkBatteryLevel(deviceId), BLEBatteryCheckInterval);
        this._batteryLevelIntervals.set(deviceId, intervalId);
    }

    /**
     * Process the sensor data from the incoming BLE characteristic.
     * @param {object} base64 - the incoming BLE data.
     * @param {string} deviceId - the device ID that received the message
     * @param {string} [characteristicId] - the UUID of the characteristic that changed
     * @private
     */
    _onMessage (base64, deviceId, characteristicId = null) {
        const data = Base64Util.base64ToUint8Array(base64);
        log.info('[WeDo2] _onMessage', deviceId, characteristicId, Array.from(data));

        // Initialize port state for this device if not exists
        if (!this._devicePorts.has(deviceId)) {
            this._devicePorts.set(deviceId, ['none', 'none']);
        }
        const ports = this._devicePorts.get(deviceId);

        // Use characteristic UUID to distinguish ATTACHED_IO from INPUT_VALUES when available.
        // Fallback to the legacy heuristic (first byte is 1 or 2) for older Scratch Link versions.
        const isAttachedIO = characteristicId ?
            characteristicId === BLECharacteristic.ATTACHED_IO :
            (data[0] === 1 || data[0] === 2);

        if (isAttachedIO) {
            const connectID = data[0];
            const type = data[3];
            log.info('[WeDo2] ATTACHED_IO', deviceId, {connectID, attached: data[1], type});

            if (data[1] === 0) {
                // clear sensor or motor
                this._clearPort(connectID, deviceId);
            } else {
                // register sensor or motor
                this._registerSensorOrMotor(connectID, type, deviceId);
            }
            return;
        }

        // read incoming sensor value
        const connectID = data[1];
        const type = ports[connectID - 1];
        const toInt8 = value => (value > 127 ? value - 256 : value);
        if (type === WeDo2Device.DISTANCE) {
            const distance = data[3] !== undefined ? (data[2] | (data[3] << 8)) : data[2];
            // log.info('[WeDo2] _onMessage distance', {deviceId, connectID, distance});
            this._updateSensorValue(WeDo2Device.DISTANCE, distance, connectID, deviceId);
        } else if (type === WeDo2Device.TILT) {
            const tiltX = toInt8(data[2]);
            const tiltY = toInt8(data[3]);
            // log.info('[WeDo2] _onMessage tilt', {deviceId, connectID, tiltX, tiltY});
            this._updateSensorValue(WeDo2Device.TILT, {tiltX, tiltY}, connectID, deviceId);
        } else {
            // log.info('[WeDo2] _onMessage unhandled INPUT_VALUES', {deviceId, connectID, type, data: Array.from(data)});
        }
    }

    /**
     * Re-subscribe ATTACHED_IO when no port table arrived after connect –
     * makes the hub re-emit its attachment table. No-op when ports are
     * already known or the device is gone.
     * @param {string} deviceId - the device ID
     * @private
     */
    _refreshPortTable (deviceId) {
        if (!this._multiBLE || !this._multiBLE.isConnected(deviceId)) return;
        const ports = this._devicePorts.get(deviceId);
        if (ports && (ports[0] !== 'none' || ports[1] !== 'none')) return;
        log.info('[WeDo2] no port table received, re-subscribing ATTACHED_IO', deviceId);
        this._multiBLE.stopNotifications(deviceId, BLEService.DEVICE_SERVICE, BLECharacteristic.ATTACHED_IO)
            .then(() => this._multiBLE.startNotifications(
                deviceId,
                BLEService.DEVICE_SERVICE,
                BLECharacteristic.ATTACHED_IO,
                (data, characteristicId) => this._onMessage(data, deviceId, characteristicId)
            ))
            .catch(err => {
                log.warn('[WeDo2] ATTACHED_IO re-subscribe failed', deviceId, err);
            });
    }

    /**
     * Check the battery level on a specific WeDo 2.0 device. If the WeDo 2.0 has disconnected
     * for some reason, the BLE socket will get an error back and automatically
     * close the socket.
     * @param {string} deviceId - the device ID to check
     */
    _checkBatteryLevel (deviceId) {
        if (this._multiBLE) {
            this._multiBLE.read(
                deviceId,
                BLEService.DEVICE_SERVICE,
                BLECharacteristic.LOW_VOLTAGE_ALERT,
                false
            ).catch(err => {
                // Don't let failed reads (e.g. on link loss) escape as
                // unhandled rejections
                console.warn('[WeDo2] battery check failed', deviceId, err);
            });
        }
    }

    /**
     * Update sensor value in global registry
     * @param {number} type - the sensor type
     * @param {any} value - the sensor value
     * @param {number} connectID - the port ID
     * @param {string} deviceId - the device ID
     * @private
     */
    _updateSensorValue (type, value, connectID, deviceId) {
        // Find the global sensor ID for this port/device combination
        for (const [globalId, sensorData] of this._globalSensors) {
            if (sensorData.deviceId === deviceId && sensorData.portIndex === connectID - 1) {
                sensorData.value = value;

                // Update legacy sensors for backward compatibility
                if (type === WeDo2Device.TILT) {
                    this._sensors.tiltX = value.tiltX;
                    this._sensors.tiltY = value.tiltY;
                } else if (type === WeDo2Device.DISTANCE) {
                    this._sensors.distance = value;
                }
                break;
            }
        }
    }

    /**
     * Register a new sensor or motor connected at a port. Store the type of
     * sensor or motor internally, and then register for notifications on input
     * values if it is a sensor.
     * @param {number} connectID - the port to register a sensor or motor on.
     * @param {number} type - the type ID of the sensor or motor
     * @param {string} deviceId - the device ID
     * @private
     */
    _registerSensorOrMotor (connectID, type, deviceId) {
        log.info('[WeDo2] _registerSensorOrMotor', {connectID, type, deviceId});
        // Initialize port state for this device if not exists
        if (!this._devicePorts.has(deviceId)) {
            this._devicePorts.set(deviceId, ['none', 'none']);
        }
        const ports = this._devicePorts.get(deviceId);

        // Guard against repeated ATTACHED_IO notifications for the same port.
        // The firmware sometimes sends multiple attach events; re-registering would
        // allocate duplicate global IDs and resend INPUT_COMMAND commands.
        // Only skip when the registry really contains the device – port state and
        // registry can desync after link loss or double resets, and then the motor
        // would stay unregistered until a physical replug.
        if (ports[connectID - 1] === type && this._isDeviceRegistered(type, connectID, deviceId)) {
            log.info('[WeDo2] _registerSensorOrMotor: already registered, skipping', {connectID, type, deviceId});
            return;
        }

        // Type change or desynced state: drop the stale port entry first.
        if (ports[connectID - 1] !== 'none') {
            this._clearPort(connectID, deviceId);
        }

        // Record motor in global registry
        if (type === WeDo2Device.MOTOR) {
            // Record which port is connected to what type of device
            ports[connectID - 1] = type;

            const globalId = this._allocateGlobalId(this._globalMotors);
            const motorInstance = new WeDo2Motor(this, connectID - 1);

            // Override the motor's send method to use the correct device
            const originalSend = motorInstance.send || (() => {});
            motorInstance.send = (uuid, message, useLimiter = true) => {
                log.info('[WeDo2Motor] send (override)', {deviceId, index: motorInstance._index, uuid, message, useLimiter});
                return this.sendToDevice(deviceId, uuid, message, useLimiter);
            };

            this._globalMotors.set(globalId, {
                deviceId,
                motorIndex: connectID - 1,
                motorInstance
            });
        } else if (type === WeDo2Device.TILT || type === WeDo2Device.DISTANCE) {
            // Record which port is connected to what type of device
            ports[connectID - 1] = type;

            // Register sensor in global registry
            const globalId = this._allocateGlobalId(this._globalSensors);
            this._globalSensors.set(globalId, {
                deviceId,
                portIndex: connectID - 1,
                type,
                value: type === WeDo2Device.TILT ? {tiltX: 0, tiltY: 0} : 0
            });

            // Set input format for tilt or distance sensor
            const typeString = type === WeDo2Device.DISTANCE ? 'DISTANCE' : 'TILT';
            const cmd = this.generateInputCommand(
                connectID,
                type,
                WeDo2Mode[typeString],
                1,
                WeDo2Unit[typeString],
                true
            );

            this.sendToDevice(deviceId, BLECharacteristic.INPUT_COMMAND, cmd);

            if (this._multiBLE) {
                this._multiBLE.startNotifications(
                    deviceId,
                    BLEService.IO_SERVICE,
                    BLECharacteristic.INPUT_VALUES,
                    (data, characteristicId) => this._onMessage(data, deviceId, characteristicId)
                );
            }
        } else {
            log.info('[WeDo2] _registerSensorOrMotor: ignoring non-motor/sensor type', type, 'on port', connectID);
        }


    }

    /**
     * Check whether a device type on a port is really present in the global
     * registry (not just the cached port state).
     * @param {number} type - the device type ID
     * @param {number} connectID - the port
     * @param {string} deviceId - the device ID
     * @returns {boolean} - true if a matching registry entry exists
     * @private
     */
    _isDeviceRegistered (type, connectID, deviceId) {
        const portIndex = connectID - 1;
        const registry = type === WeDo2Device.MOTOR ? this._globalMotors : this._globalSensors;
        const indexKey = type === WeDo2Device.MOTOR ? 'motorIndex' : 'portIndex';
        for (const [, data] of registry) {
            if (data.deviceId === deviceId && data[indexKey] === portIndex) {
                return true;
            }
        }
        return false;
    }

    /**
     * Allocate the lowest unused global ID so labels stay stable (A, B, C ...):
     * a removed motor frees its letter for the next registration.
     * @param {Map<number, object>} registry - the global motor or sensor map
     * @returns {number} - the lowest free ID
     * @private
     */
    _allocateGlobalId (registry) {
        let id = 0;
        while (registry.has(id)) {
            id++;
        }
        return id;
    }

    /**
     * Clear the sensor or motor present at port 1 or 2.
     * @param {number} connectID - the port to clear.
     * @param {string} deviceId - the device ID
     * @private
     */
    _clearPort (connectID, deviceId) {
        log.info('[WeDo2] _clearPort', {connectID, deviceId});
        // Initialize port state for this device if not exists
        if (!this._devicePorts.has(deviceId)) {
            this._devicePorts.set(deviceId, ['none', 'none']);
        }
        const ports = this._devicePorts.get(deviceId);

        const type = ports[connectID - 1];

        // Remove from global registries
        if (type === WeDo2Device.MOTOR) {
            // Find and remove motor from global registry
            for (const [globalId, motorData] of this._globalMotors) {
                if (motorData.deviceId === deviceId && motorData.motorIndex === connectID - 1) {
                    this._globalMotors.delete(globalId);
                    break;
                }
            }
        } else if (type === WeDo2Device.TILT) {
            // Find and remove sensor from global registry
            for (const [globalId, sensorData] of this._globalSensors) {
                if (sensorData.deviceId === deviceId && sensorData.portIndex === connectID - 1) {
                    this._globalSensors.delete(globalId);
                    break;
                }
            }
            // Reset legacy tilt values
            this._sensors.tiltX = this._sensors.tiltY = 0;
        } else if (type === WeDo2Device.DISTANCE) {
            // Find and remove sensor from global registry
            for (const [globalId, sensorData] of this._globalSensors) {
                if (sensorData.deviceId === deviceId && sensorData.portIndex === connectID - 1) {
                    this._globalSensors.delete(globalId);
                    break;
                }
            }
            // Reset legacy distance value
            this._sensors.distance = 0;
        }



        ports[connectID - 1] = 'none';
    }
}

/**
 * Enum for motor specification.
 * Note: This is kept for legacy compatibility. Dynamic motor labels are generated at runtime.
 * @readonly
 * @enum {string}
 */
const WeDo2MotorLabel = {
    DEFAULT: 'motor',
    A: 'motor A',
    B: 'motor B',
    ALL: 'all motors'
};

/**
 * Enum for motor direction specification.
 * @readonly
 * @enum {string}
 */
const WeDo2MotorDirection = {
    FORWARD: 'this way',
    BACKWARD: 'that way',
    REVERSE: 'reverse'
};

/**
 * Enum for tilt sensor direction.
 * @readonly
 * @enum {string}
 */
const WeDo2TiltDirection = {
    UP: 'up',
    DOWN: 'down',
    LEFT: 'left',
    RIGHT: 'right',
    ANY: 'any'
};

/**
 * Enum for tilt sensor specification.
 * @readonly
 * @enum {string}
 */
const WeDo2TiltSensorLabel = {
    DEFAULT: 'tilt sensor',
    A: 'tilt sensor A',
    B: 'tilt sensor B',
    ANY: 'any tilt sensor'
};

/**
 * Enum for distance sensor specification.
 * @readonly
 * @enum {string}
 */
const WeDo2DistanceSensorLabel = {
    DEFAULT: 'distance sensor',
    A: 'distance sensor A',
    B: 'distance sensor B'
};

/**
 * Scratch 3.0 blocks to interact with a LEGO WeDo 2.0 peripheral.
 */
class Scratch3WeDo2Blocks {

    /**
     * @returns {string} - the ID of this extension.
     */
    static get EXTENSION_ID () {
        return 'wedo2';
    }

    /**
     * @returns {number} - the tilt sensor counts as "tilted" if its tilt angle meets or exceeds this threshold.
     */
    static get TILT_THRESHOLD () {
        return 15;
    }

    /**
     * Construct a set of WeDo 2.0 blocks.
     * @param {Runtime} runtime - the Scratch 3.0 runtime.
     */
    constructor (runtime) {
        /**
         * The Scratch 3.0 runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        // Create a new WeDo 2.0 peripheral instance
        this._peripheral = new WeDo2(this.runtime, Scratch3WeDo2Blocks.EXTENSION_ID);

        // Expose peripheral motor/sensor registries so block helper methods can use them
        this._globalMotors = this._peripheral._globalMotors;
        this._globalSensors = this._peripheral._globalSensors;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        const availableMotors = this._peripheral.getAvailableMotors();
        const availableSensors = this._peripheral.getAvailableSensors();
        const connectedDevices = this._peripheral.getConnectedDevices();
        // log.info('[WeDo2] getInfo building menus;',
        //     'availableMotors:', availableMotors,
        //     'availableSensors:', availableSensors,
        //     'connectedDevices:', connectedDevices);

        // Build dynamic device menu
        const deviceMenuItems = [
            {
                text: formatMessage({
                    id: 'wedo2.deviceId.all',
                    default: 'all devices',
                    description: 'label for all devices element in device menu for LEGO WeDo 2 extension'
                }),
                value: 'ALL'
            }
        ];

        // Add all connected devices
        for (const device of connectedDevices) {
            deviceMenuItems.push({
                text: device.label,
                value: device.deviceId
            });
        }

        // Build motor menu with specific motor labels (Motor A, Motor B, ...) and
        // an "all motors" option. The default is the first connected motor, or
        // "all motors" if none is connected yet.
        const motorMenuItems = [];
        for (const motor of availableMotors) {
            motorMenuItems.push({
                text: motor.label,
                value: motor.label
            });
        }
        motorMenuItems.push({
            text: formatMessage({
                id: 'wedo2.motorId.all',
                default: 'all motors',
                description: 'label for all motors element in motor menu for LEGO WeDo 2 extension'
            }),
            value: WeDo2MotorLabel.ALL
        });
        const defaultMotorValue = availableMotors.length > 0 ?
            availableMotors[0].label : WeDo2MotorLabel.ALL;
        
        // Build dynamic sensor menus for tilt sensors
        const tiltSensorMenuItems = [
            {
                text: formatMessage({
                    id: 'wedo2.tiltSensorId.default',
                    default: 'tilt sensor',
                    description: 'label for tilt sensor element in tilt sensor menu for LEGO WeDo 2 extension'
                }),
                value: WeDo2TiltSensorLabel.DEFAULT
            }
        ];
        
        // Add all available tilt sensors
        for (const sensor of availableSensors) {
            if (sensor.type === WeDo2Device.TILT) {
                tiltSensorMenuItems.push({
                    text: sensor.label,
                    value: sensor.label
                });
            }
        }
        
        // Add "any tilt sensor" option
        tiltSensorMenuItems.push({
            text: formatMessage({
                id: 'wedo2.tiltSensorId.any',
                default: 'any tilt sensor',
                description: 'label for any tilt sensor element in tilt sensor menu for LEGO WeDo 2 extension'
            }),
            value: WeDo2TiltSensorLabel.ANY
        });
        
        // Build dynamic sensor menus for distance sensors
        const distanceSensorMenuItems = [
            {
                text: formatMessage({
                    id: 'wedo2.distanceSensorId.default',
                    default: 'distance sensor',
                    description: 'label for distance sensor element in distance sensor menu for LEGO WeDo 2 extension'
                }),
                value: WeDo2DistanceSensorLabel.DEFAULT
            }
        ];
        
        // Add all available distance sensors
        for (const sensor of availableSensors) {
            if (sensor.type === WeDo2Device.DISTANCE) {
                distanceSensorMenuItems.push({
                    text: sensor.label,
                    value: sensor.label
                });
            }
        }

        return {
            id: Scratch3WeDo2Blocks.EXTENSION_ID,
            name: 'WeDo 2.0',
            blockIconURI: iconURI,
            showStatusButton: true,
            multipleDevices: true,
            menus: {
                DEVICE_ID: deviceMenuItems,
                MOTOR_ID: motorMenuItems,
                MOTOR_DIRECTION: [
                    {
                        text: formatMessage({
                            id: 'wedo2.motorDirection.thisway',
                            default: 'this way',
                            description: 'label for "this way" motor direction for LEGO WeDo 2 extension'
                        }),
                        value: WeDo2MotorDirection.FORWARD
                    },
                    {
                        text: formatMessage({
                            id: 'wedo2.motorDirection.thatway',
                            default: 'that way',
                            description: 'label for "that way" motor direction for LEGO WeDo 2 extension'
                        }),
                        value: WeDo2MotorDirection.BACKWARD
                    },
                    {
                        text: formatMessage({
                            id: 'wedo2.motorDirection.reverse',
                            default: 'reverse',
                            description: 'label for "reverse" motor direction for LEGO WeDo 2 extension'
                        }),
                        value: WeDo2MotorDirection.REVERSE
                    }
                ],
                OP: [
                    {
                        text: formatMessage({
                            id: 'wedo2.op.less',
                            default: '<',
                            description: 'label for less than operator for LEGO WeDo 2 extension'
                        }),
                        value: '<'
                    },
                    {
                        text: formatMessage({
                            id: 'wedo2.op.greater',
                            default: '>',
                            description: 'label for greater than operator for LEGO WeDo 2 extension'
                        }),
                        value: '>'
                    }
                ],
                TILT_DIRECTION_ANY: [
                    {
                        text: formatMessage({
                            id: 'wedo2.tiltDirectionAny.up',
                            default: 'up',
                            description: 'label for up tilt direction for LEGO WeDo 2 extension'
                        }),
                        value: WeDo2TiltDirection.UP
                    },
                    {
                        text: formatMessage({
                            id: 'wedo2.tiltDirectionAny.down',
                            default: 'down',
                            description: 'label for down tilt direction for LEGO WeDo 2 extension'
                        }),
                        value: WeDo2TiltDirection.DOWN
                    },
                    {
                        text: formatMessage({
                            id: 'wedo2.tiltDirectionAny.left',
                            default: 'left',
                            description: 'label for left tilt direction for LEGO WeDo 2 extension'
                        }),
                        value: WeDo2TiltDirection.LEFT
                    },
                    {
                        text: formatMessage({
                            id: 'wedo2.tiltDirectionAny.right',
                            default: 'right',
                            description: 'label for right tilt direction for LEGO WeDo 2 extension'
                        }),
                        value: WeDo2TiltDirection.RIGHT
                    },
                    {
                        text: formatMessage({
                            id: 'wedo2.tiltDirectionAny.any',
                            default: 'any',
                            description: 'label for any tilt direction for LEGO WeDo 2 extension'
                        }),
                        value: WeDo2TiltDirection.ANY
                    }
                ],
                TILT_DIRECTION: [
                    {
                        text: formatMessage({
                            id: 'wedo2.tiltDirection.up',
                            default: 'up',
                            description: 'label for up tilt direction for LEGO WeDo 2 extension'
                        }),
                        value: WeDo2TiltDirection.UP
                    },
                    {
                        text: formatMessage({
                            id: 'wedo2.tiltDirection.down',
                            default: 'down',
                            description: 'label for down tilt direction for LEGO WeDo 2 extension'
                        }),
                        value: WeDo2TiltDirection.DOWN
                    },
                    {
                        text: formatMessage({
                            id: 'wedo2.tiltDirection.left',
                            default: 'left',
                            description: 'label for left tilt direction for LEGO WeDo 2 extension'
                        }),
                        value: WeDo2TiltDirection.LEFT
                    },
                    {
                        text: formatMessage({
                            id: 'wedo2.tiltDirection.right',
                            default: 'right',
                            description: 'label for right tilt direction for LEGO WeDo 2 extension'
                        }),
                        value: WeDo2TiltDirection.RIGHT
                    }
                ],
                TILT_SENSOR_ID: tiltSensorMenuItems,
                DISTANCE_SENSOR_ID: distanceSensorMenuItems
            },
            blocks: [
                {
                    opcode: 'motorOnFor',
                    text: formatMessage({
                        id: 'wedo2.motorOnFor',
                        default: 'turn [MOTOR_ID] on for [DURATION] seconds',
                        description: 'turn a motor on for some time'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        MOTOR_ID: {
                            type: ArgumentType.STRING,
                            menu: 'MOTOR_ID',
                            defaultValue: defaultMotorValue
                        },
                        DURATION: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                },
                {
                    opcode: 'motorOn',
                    text: formatMessage({
                        id: 'wedo2.motorOn',
                        default: 'turn [MOTOR_ID] on',
                        description: 'turn a motor on indefinitely'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        MOTOR_ID: {
                            type: ArgumentType.STRING,
                            menu: 'MOTOR_ID',
                            defaultValue: defaultMotorValue
                        }
                    }
                },
                {
                    opcode: 'motorOff',
                    text: formatMessage({
                        id: 'wedo2.motorOff',
                        default: 'turn [MOTOR_ID] off',
                        description: 'turn a motor off'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        MOTOR_ID: {
                            type: ArgumentType.STRING,
                            menu: 'MOTOR_ID',
                            defaultValue: defaultMotorValue
                        }
                    }
                },
                {
                    opcode: 'startMotorPower',
                    text: formatMessage({
                        id: 'wedo2.startMotorPower',
                        default: 'set [MOTOR_ID] power to [POWER]',
                        description: 'set the motor\'s power and turn it on'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        MOTOR_ID: {
                            type: ArgumentType.STRING,
                            menu: 'MOTOR_ID',
                            defaultValue: defaultMotorValue
                        },
                        POWER: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        }
                    }
                },
                {
                    opcode: 'setMotorDirection',
                    text: formatMessage({
                        id: 'wedo2.setMotorDirection',
                        default: 'set [MOTOR_ID] direction to [MOTOR_DIRECTION]',
                        description: 'set the motor\'s turn direction'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        MOTOR_ID: {
                            type: ArgumentType.STRING,
                            menu: 'MOTOR_ID',
                            defaultValue: defaultMotorValue
                        },
                        MOTOR_DIRECTION: {
                            type: ArgumentType.STRING,
                            menu: 'MOTOR_DIRECTION',
                            defaultValue: WeDo2MotorDirection.FORWARD
                        }
                    }
                },
                {
                    opcode: 'setLightHue',
                    text: formatMessage({
                        id: 'wedo2.setLightHue.v2',
                        default: 'set light color on [DEVICE_ID] to [HUE]',
                        description: 'set the LED color'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        DEVICE_ID: {
                            type: ArgumentType.STRING,
                            menu: 'DEVICE_ID',
                            defaultValue: 'ALL'
                        },
                        HUE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 50
                        }
                    }
                },
                /*
                {
                    opcode: 'playNoteFor',
                    text: formatMessage({
                        id: 'wedo2.playNoteFor.v2',
                        default: 'play note [NOTE] on [DEVICE_ID] for [DURATION] seconds',
                        description: 'play a certain note for some time'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        NOTE: {
                            type: ArgumentType.NUMBER, // TODO: ArgumentType.MIDI_NOTE?
                            defaultValue: 60
                        },
                        DEVICE_ID: {
                            type: ArgumentType.STRING,
                            menu: 'DEVICE_ID',
                            defaultValue: 'ALL'
                        },
                        DURATION: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0.5
                        }
                    }
                },
                */
                {
                    opcode: 'whenDistance',
                    text: formatMessage({
                        id: 'wedo2.whenDistance.v2',
                        default: 'when [DISTANCE_SENSOR] distance [OP] [REFERENCE]',
                        description: 'check for when distance is < or > than reference'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        DISTANCE_SENSOR: {
                            type: ArgumentType.STRING,
                            menu: 'DISTANCE_SENSOR_ID',
                            defaultValue: WeDo2DistanceSensorLabel.DEFAULT
                        },
                        OP: {
                            type: ArgumentType.STRING,
                            menu: 'OP',
                            defaultValue: '<'
                        },
                        REFERENCE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 50
                        }
                    }
                },
                {
                    opcode: 'isDistance',
                    text: formatMessage({
                        id: 'wedo2.isDistance.v2',
                        default: '[DISTANCE_SENSOR] distance [OP] [REFERENCE]?',
                        description: 'check whether distance is < or > than reference'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        DISTANCE_SENSOR: {
                            type: ArgumentType.STRING,
                            menu: 'DISTANCE_SENSOR_ID',
                            defaultValue: WeDo2DistanceSensorLabel.DEFAULT
                        },
                        OP: {
                            type: ArgumentType.STRING,
                            menu: 'OP',
                            defaultValue: '<'
                        },
                        REFERENCE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 50
                        }
                    }
                },
                {
                    opcode: 'getDistance',
                    text: formatMessage({
                        id: 'wedo2.getDistance.v2',
                        default: '[DISTANCE_SENSOR] distance',
                        description: 'the value returned by distance sensor'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        DISTANCE_SENSOR: {
                            type: ArgumentType.STRING,
                            menu: 'DISTANCE_SENSOR_ID',
                            defaultValue: WeDo2DistanceSensorLabel.DEFAULT
                        }
                    }
                },
                {
                    opcode: 'whenTilted',
                    text: formatMessage({
                        id: 'wedo2.whenTilted.v2',
                        default: 'when [TILT_SENSOR_ID] tilted [TILT_DIRECTION_ANY]',
                        description: 'check when tilted in a certain direction'
                    }),
                    func: 'isTilted',
                    blockType: BlockType.HAT,
                    arguments: {
                        TILT_SENSOR_ID: {
                            type: ArgumentType.STRING,
                            menu: 'TILT_SENSOR_ID',
                            defaultValue: WeDo2TiltSensorLabel.ANY
                        },
                        TILT_DIRECTION_ANY: {
                            type: ArgumentType.STRING,
                            menu: 'TILT_DIRECTION_ANY',
                            defaultValue: WeDo2TiltDirection.ANY
                        }
                    }
                },
                {
                    opcode: 'isTilted',
                    text: formatMessage({
                        id: 'wedo2.isTilted.v2',
                        default: '[TILT_SENSOR_ID] tilted [TILT_DIRECTION_ANY]?',
                        description: 'whether tilt sensor is tilted'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        TILT_SENSOR_ID: {
                            type: ArgumentType.STRING,
                            menu: 'TILT_SENSOR_ID',
                            defaultValue: WeDo2TiltSensorLabel.ANY
                        },
                        TILT_DIRECTION_ANY: {
                            type: ArgumentType.STRING,
                            menu: 'TILT_DIRECTION_ANY',
                            defaultValue: WeDo2TiltDirection.ANY
                        }
                    }
                },
                {
                    opcode: 'getTiltAngle',
                    text: formatMessage({
                        id: 'wedo2.getTiltAngle.v2',
                        default: 'tilt angle [TILT_DIRECTION] of [TILT_SENSOR_ID]',
                        description: 'the angle returned by tilt sensor'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        TILT_DIRECTION: {
                            type: ArgumentType.STRING,
                            menu: 'TILT_DIRECTION',
                            defaultValue: WeDo2TiltDirection.UP
                        },
                        TILT_SENSOR_ID: {
                            type: ArgumentType.STRING,
                            menu: 'TILT_SENSOR_ID',
                            defaultValue: WeDo2TiltSensorLabel.ANY
                        }
                    }
                },
            ],
            menus: {
                DEVICE_ID: {
                    acceptReporters: true,
                    items: 'getDeviceMenuItems'
                },
                MOTOR_ID: {
                    acceptReporters: true,
                    items: 'getMotorMenuItems'
                },
                MOTOR_DIRECTION: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'wedo2.motorDirection.forward',
                                default: 'this way',
                                description:
                                    'label for forward element in motor direction menu for LEGO WeDo 2 extension'
                            }),
                            value: WeDo2MotorDirection.FORWARD
                        },
                        {
                            text: formatMessage({
                                id: 'wedo2.motorDirection.backward',
                                default: 'that way',
                                description:
                                    'label for backward element in motor direction menu for LEGO WeDo 2 extension'
                            }),
                            value: WeDo2MotorDirection.BACKWARD
                        },
                        {
                            text: formatMessage({
                                id: 'wedo2.motorDirection.reverse',
                                default: 'reverse',
                                description:
                                    'label for reverse element in motor direction menu for LEGO WeDo 2 extension'
                            }),
                            value: WeDo2MotorDirection.REVERSE
                        }
                    ]
                },
                TILT_SENSOR_ID: {
                    acceptReporters: true,
                    items: 'getTiltSensorMenuItems'
                },
                DISTANCE_SENSOR_ID: {
                    acceptReporters: true,
                    items: 'getDistanceSensorMenuItems'
                },
                TILT_DIRECTION_ANY: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'wedo2.tiltDirection.any',
                                default: 'any',
                                description: 'label for any element in tilt direction menu for LEGO WeDo 2 extension'
                            }),
                            value: WeDo2TiltDirection.ANY
                        },
                        {
                            text: formatMessage({
                                id: 'wedo2.tiltDirection.up',
                                default: 'up',
                                description: 'label for up element in tilt direction menu for LEGO WeDo 2 extension'
                            }),
                            value: WeDo2TiltDirection.UP
                        },
                        {
                            text: formatMessage({
                                id: 'wedo2.tiltDirection.down',
                                default: 'down',
                                description: 'label for down element in tilt direction menu for LEGO WeDo 2 extension'
                            }),
                            value: WeDo2TiltDirection.DOWN
                        },
                        {
                            text: formatMessage({
                                id: 'wedo2.tiltDirection.left',
                                default: 'left',
                                description: 'label for left element in tilt direction menu for LEGO WeDo 2 extension'
                            }),
                            value: WeDo2TiltDirection.LEFT
                        },
                        {
                            text: formatMessage({
                                id: 'wedo2.tiltDirection.right',
                                default: 'right',
                                description: 'label for right element in tilt direction menu for LEGO WeDo 2 extension'
                            }),
                            value: WeDo2TiltDirection.RIGHT
                        }
                    ]
                },
                TILT_DIRECTION: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'wedo2.tiltDirection.up',
                                default: 'up',
                                description: 'label for up element in tilt direction menu for LEGO WeDo 2 extension'
                            }),
                            value: WeDo2TiltDirection.UP
                        },
                        {
                            text: formatMessage({
                                id: 'wedo2.tiltDirection.down',
                                default: 'down',
                                description: 'label for down element in tilt direction menu for LEGO WeDo 2 extension'
                            }),
                            value: WeDo2TiltDirection.DOWN
                        },
                        {
                            text: formatMessage({
                                id: 'wedo2.tiltDirection.left',
                                default: 'left',
                                description: 'label for left element in tilt direction menu for LEGO WeDo 2 extension'
                            }),
                            value: WeDo2TiltDirection.LEFT
                        },
                        {
                            text: formatMessage({
                                id: 'wedo2.tiltDirection.right',
                                default: 'right',
                                description: 'label for right element in tilt direction menu for LEGO WeDo 2 extension'
                            }),
                            value: WeDo2TiltDirection.RIGHT
                        }
                    ]
                },
                OP: {
                    acceptReporters: true,
                    items: ['<', '>']
                }
            }
        };
    }

    /**
     * Generate the live list of connected devices for the DEVICE_ID menu.
     * @returns {Array.<{text: string, value: string}>} - menu items.
     */
    getDeviceMenuItems () {
        const connectedDevices = this._peripheral.getConnectedDevices();
        const items = [{
            text: formatMessage({
                id: 'wedo2.deviceId.all',
                default: 'all devices',
                description: 'label for all devices element in device menu for LEGO WeDo 2 extension'
            }),
            value: 'ALL'
        }];
        for (const device of connectedDevices) {
            items.push({
                text: device.label,
                value: device.deviceId
            });
        }
        return items;
    }

    /**
     * Generate the live list of connected motors for the MOTOR_ID menu.
     * @returns {Array.<{text: string, value: string}>} - menu items.
     */
    getMotorMenuItems () {
        const availableMotors = this._peripheral.getAvailableMotors();
        const items = [{
            text: formatMessage({
                id: 'wedo2.motorId.all',
                default: 'all motors',
                description: 'label for all motors element in motor menu for LEGO WeDo 2 extension'
            }),
            value: WeDo2MotorLabel.ALL
        }];
        for (const motor of availableMotors) {
            items.push({
                text: motor.label,
                value: motor.label
            });
        }
        return items;
    }

    /**
     * Generate the live list of tilt sensors for the TILT_SENSOR_ID menu.
     * @returns {Array.<{text: string, value: string}>} - menu items.
     */
    getTiltSensorMenuItems () {
        const availableSensors = this._peripheral.getAvailableSensors();
        const items = [{
            text: formatMessage({
                id: 'wedo2.tiltSensorId.any',
                default: 'any tilt sensor',
                description: 'label for any tilt sensor element in tilt sensor menu for LEGO WeDo 2 extension'
            }),
            value: WeDo2TiltSensorLabel.ANY
        }];
        for (const sensor of availableSensors) {
            if (sensor.type === WeDo2Device.TILT) {
                items.push({
                    text: sensor.label,
                    value: sensor.label
                });
            }
        }
        return items;
    }

    /**
     * Generate the live list of distance sensors for the DISTANCE_SENSOR_ID menu.
     * @returns {Array.<{text: string, value: string}>} - menu items.
     */
    getDistanceSensorMenuItems () {
        const availableSensors = this._peripheral.getAvailableSensors();
        const items = [{
            text: formatMessage({
                id: 'wedo2.distanceSensorId.default',
                default: 'all distance sensors',
                description: 'label for all distance sensors element in distance sensor menu for LEGO WeDo 2 extension'
            }),
            value: WeDo2DistanceSensorLabel.DEFAULT
        }];
        for (const sensor of availableSensors) {
            if (sensor.type === WeDo2Device.DISTANCE) {
                items.push({
                    text: sensor.label,
                    value: sensor.label
                });
            }
        }
        return items;
    }

    /**
     * Find the value of one or all distance sensors by label.
     * @param {string} [sensorLabel] - the sensor label, or default for the first one.
     * @returns {number} - the sensor's distance value, or 0 if unavailable.
     * @private
     */
    _getDistanceSensorValue (sensorLabel = WeDo2DistanceSensorLabel.DEFAULT) {
        const availableSensors = this._peripheral.getAvailableSensors();
        if (sensorLabel && sensorLabel !== WeDo2DistanceSensorLabel.DEFAULT) {
            for (const sensor of availableSensors) {
                if (sensor.type === WeDo2Device.DISTANCE && sensor.label === sensorLabel) {
                    const sensorData = this._peripheral.getSensor(sensor.id);
                    if (sensorData) {
                        return sensorData.value;
                    }
                }
            }
        } else {
            for (const sensor of availableSensors) {
                if (sensor.type === WeDo2Device.DISTANCE) {
                    const sensorData = this._peripheral.getSensor(sensor.id);
                    if (sensorData) {
                        return sensorData.value;
                    }
                }
            }
        }
        return this._peripheral.distance;
    }

    /**
     * Find the value of one or all tilt sensors by label.
     * @param {string} [sensorLabel] - the sensor label, or default for the first one.
     * @returns {Object} - an object with tiltX and tiltY, or zeros if unavailable.
     * @private
     */
    _getTiltSensorValue (sensorLabel = WeDo2TiltSensorLabel.DEFAULT) {
        const availableSensors = this._peripheral.getAvailableSensors();
        if (sensorLabel &&
            sensorLabel !== WeDo2TiltSensorLabel.DEFAULT &&
            sensorLabel !== WeDo2TiltSensorLabel.ANY) {
            for (const sensor of availableSensors) {
                if (sensor.type === WeDo2Device.TILT && sensor.label === sensorLabel) {
                    const sensorData = this._peripheral.getSensor(sensor.id);
                    if (sensorData) {
                        return sensorData.value || { tiltX: 0, tiltY: 0 };
                    }
                }
            }
        } else {
            for (const sensor of availableSensors) {
                if (sensor.type === WeDo2Device.TILT) {
                    const sensorData = this._peripheral.getSensor(sensor.id);
                    if (sensorData) {
                        return sensorData.value || { tiltX: 0, tiltY: 0 };
                    }
                }
            }
        }
        const legacy = this._peripheral.tiltX !== undefined && this._peripheral.tiltY !== undefined;
        return { tiltX: legacy ? this._peripheral.tiltX : 0, tiltY: legacy ? this._peripheral.tiltY : 0 };
    }

    /**
     * Execute a callback function for each motor specified by the motor ID.
     * Multi-Hub Support: Iterates over all available motors across all hubs.
     * @param {string} motorId - the motor ID specification.
     * @param {Function} callback - the function to execute for each motor.
     * @private
     */
    _forEachMotor (motorId, callback) {
        // Handle legacy motor IDs (A, B), the default first motor, and ALL
        const availableMotors = this._peripheral.getAvailableMotors();
        log.info('[WeDo2] _forEachMotor', motorId, 'availableMotors:', availableMotors);

        for (const motorInfo of availableMotors) {
            let shouldExecute = false;

            // Legacy compatibility: A, B, ALL
            if (motorId === 'A' && motorInfo.label.includes('A')) {
                shouldExecute = true;
            } else if (motorId === 'B' && motorInfo.label.includes('B')) {
                shouldExecute = true;
            } else if (motorId === WeDo2MotorLabel.ALL) {
                shouldExecute = true;
            } else if (motorId === WeDo2MotorLabel.DEFAULT && motorInfo === availableMotors[0]) {
                // "motor" refers to the first connected motor
                shouldExecute = true;
            } else if (motorId === motorInfo.label) {
                // Exact match for dynamic labels (kept for compatibility with saved projects)
                shouldExecute = true;
            }

            if (shouldExecute) {
                // Get the actual motor from the global registry
                const motorData = this._globalMotors.get(motorInfo.id);
                if (motorData) {
                    callback(motorInfo.id);
                }
            }
        }
    }

    /**
     * Turn specified motor(s) on for a specified duration.
     * @param {object} args - the block's arguments.
     * @property {MotorID} MOTOR_ID - the motor(s) to activate.
     * @property {int} DURATION - the amount of time to run the motors.
     * @returns {Promise} - a promise which will resolve at the end of the duration.
     */
    motorOnFor (args) {
        // TODO: cast args.MOTOR_ID?
        log.info('[WeDo2] motorOnFor called', args);
        let durationMS = Cast.toNumber(args && args.DURATION) * 1000;
        durationMS = MathUtil.clamp(durationMS, 0, 15000);
        return new Promise(resolve => {
            this._forEachMotor(args && args.MOTOR_ID, motorId => {
                const motorData = this._globalMotors.get(motorId);
                if (motorData && motorData.motorInstance) {
                    motorData.motorInstance.turnOnFor(durationMS);
                }
            });

            // Run for some time even when no motor is connected
            setTimeout(resolve, durationMS);
        });
    }

    /**
     * Turn specified motor(s) on indefinitely.
     * @param {object} args - the block's arguments.
     * @property {MotorID} MOTOR_ID - the motor(s) to activate.
     * @returns {Promise} - a Promise that resolves after some delay.
     */
    motorOn (args) {
        // TODO: cast args.MOTOR_ID?
        log.info('[WeDo2] motorOn called', args);
        this._forEachMotor(args && args.MOTOR_ID, motorId => {
            const motorData = this._globalMotors.get(motorId);
            if (motorData && motorData.motorInstance) {
                motorData.motorInstance.turnOn();
            }
        });

        return new Promise(resolve => {
            window.setTimeout(() => {
                resolve();
            }, BLESendInterval);
        });
    }

    /**
     * Turn specified motor(s) off.
     * @param {object} args - the block's arguments.
     * @property {MotorID} MOTOR_ID - the motor(s) to deactivate.
     * @returns {Promise} - a Promise that resolves after some delay.
     */
    motorOff (args) {
        // TODO: cast args.MOTOR_ID?
        log.info('[WeDo2] motorOff called', args);
        this._forEachMotor(args && args.MOTOR_ID, motorId => {
            const motorData = this._globalMotors.get(motorId);
            if (motorData && motorData.motorInstance) {
                motorData.motorInstance.turnOff();
            }
        });

        return new Promise(resolve => {
            window.setTimeout(() => {
                resolve();
            }, BLESendInterval);
        });
    }

    /**
     * Turn specified motor(s) off.
     * @param {object} args - the block's arguments.
     * @property {MotorID} MOTOR_ID - the motor(s) to be affected.
     * @property {int} POWER - the new power level for the motor(s).
     * @returns {Promise} - a Promise that resolves after some delay.
     */
    startMotorPower (args) {
        // TODO: cast args.MOTOR_ID?
        log.info('[WeDo2] startMotorPower called', args);
        this._forEachMotor(args && args.MOTOR_ID, motorId => {
            const motorData = this._globalMotors.get(motorId);
            if (motorData && motorData.motorInstance) {
                motorData.motorInstance.power = MathUtil.clamp(Cast.toNumber(args && args.POWER), 0, 100);
                motorData.motorInstance.turnOn();
            }
        });

        return new Promise(resolve => {
            window.setTimeout(() => {
                resolve();
            }, BLESendInterval);
        });
    }

   /**
     * Set the direction of rotation for specified motor(s).
     * @param {object} args - the block's arguments.
     * @property {MotorID} MOTOR_ID - the motor(s) to be affected.
     * @property {string} DIRECTION - 'this way', 'that way', or 'reverse'.
     * @returns {Promise} - a Promise that resolves after some delay.
     */
    setMotorDirection (args) {
        // TODO: cast args.MOTOR_ID?
        log.info('[WeDo2] setMotorDirection called', args);
        this._forEachMotor(args && args.MOTOR_ID, motorId => {
            const motorData = this._globalMotors.get(motorId);
            if (motorData && motorData.motorInstance) {
                switch (args && args.MOTOR_DIRECTION) {
                case 'this way':
                    motorData.motorInstance.direction = 1; // Normal
                    break;
                case 'that way':
                    motorData.motorInstance.direction = -1; // Reverse
                    break;
                case 'reverse':
                    motorData.motorInstance.direction = -motorData.motorInstance.direction; // Toggle
                    break;
                }
                // log.info('[WeDo2] setMotorDirection', motorId, 'isOn:', motorData.motorInstance.isOn, 'direction:', motorData.motorInstance.direction);
                if (motorData.motorInstance.isOn) {
                    motorData.motorInstance.turnOn();
                }
            }
        });

        return new Promise(resolve => {
            window.setTimeout(() => {
                resolve();
            }, BLESendInterval);
        });
    }
    /**
     * Set the LED's hue on a specific device or all devices.
     * @param {object} args - the block's arguments.
     * @property {string} DEVICE_ID - the device ID or 'ALL'.
     * @property {number} HUE - the hue to set, in the range [0,100].
     * @returns {Promise} - a Promise that resolves after some delay.
     */
    setLightHue (args) {
        // Convert from [0,100] to [0,360]
        let inputHue = Cast.toNumber(args && args.HUE);
        inputHue = MathUtil.wrapClamp(inputHue, 0, 100);
        const hue = inputHue * 360 / 100;

        const rgbObject = color.hsvToRgb({h: hue, s: 1, v: 1});

        const rgbDecimal = color.rgbToDecimal(rgbObject);

        // log.info('[WeDo2] setLightHue', args, 'rgbDecimal:', rgbDecimal);

        const deviceId = (args && args.DEVICE_ID) || 'ALL';
        if (deviceId === 'ALL') {
            return this._peripheral.setLED(rgbDecimal);
        }
        return this._peripheral.setLEDOnDevice(deviceId, rgbDecimal);
    }

    /**
     * Make the WeDo 2.0 peripheral play a MIDI note for the specified duration on a specific device or all devices.
     * @param {object} args - the block's arguments.
     * @property {number} NOTE - the MIDI note to play.
     * @property {string} DEVICE_ID - the device ID or 'ALL'.
     * @property {number} DURATION - the duration of the note, in seconds.
     * @returns {Promise} - a promise which will resolve at the end of the duration.
     */
    playNoteFor (args) {
        let durationMS = Cast.toNumber(args && args.DURATION) * 1000;
        durationMS = MathUtil.clamp(durationMS, 0, 65536); // max duration supported by WeDo 2.0 piezo
        const note = MathUtil.clamp(Cast.toNumber(args && args.NOTE), 25, 125); // valid WeDo 2.0 sounds
        if (durationMS === 0) return; // WeDo 2.0 plays duration '0' forever
        const tone = this._noteToTone(note);
        // log.info('[WeDo2] playNoteFor', args, 'tone:', tone);

        const deviceId = (args && args.DEVICE_ID) || 'ALL';
        const playPromise = (deviceId === 'ALL') ?
            this._peripheral.playTone(tone, durationMS) :
            this._peripheral.playToneOnDevice(deviceId, tone, durationMS);

        return playPromise.then(() => new Promise(resolve => {
            // Run for some time even when no piezo is connected
            setTimeout(resolve, durationMS);
        }));
    }

    /**
     * Test whether a tilt sensor (or all tilt sensors for ANY) is tilted.
     * @param {string} tiltDirection - the tilt direction to test.
     * @param {string} [sensorLabel] - the sensor label, or default for the first one.
     * @returns {boolean} - true if tilted past the threshold in the specified direction.
     * @private
     */
    _isTilted (tiltDirection, sensorLabel = WeDo2TiltSensorLabel.DEFAULT) {
        const checkSensor = (value) => {
            const tiltX = value ? value.tiltX : 0;
            const tiltY = value ? value.tiltY : 0;
            switch (tiltDirection) {
            case WeDo2TiltDirection.UP: return tiltY > 15;
            case WeDo2TiltDirection.DOWN: return tiltY < -15;
            case WeDo2TiltDirection.LEFT: return tiltX < -15;
            case WeDo2TiltDirection.RIGHT: return tiltX > 15;
            case WeDo2TiltDirection.ANY: return Math.abs(tiltX) > 15 || Math.abs(tiltY) > 15;
            default: return false;
            }
        };

        if (sensorLabel === WeDo2TiltSensorLabel.ANY) {
            const availableSensors = this._peripheral.getAvailableSensors();
            for (const sensor of availableSensors) {
                if (sensor.type === WeDo2Device.TILT) {
                    const sensorData = this._peripheral.getSensor(sensor.id);
                    if (sensorData && checkSensor(sensorData.value)) {
                        return true;
                    }
                }
            }
            return false;
        }

        return checkSensor(this._getTiltSensorValue(sensorLabel));
    }

    /**
     * Get the tilt angle for a specific direction from one tilt sensor.
     * @param {string} tiltDirection - the direction to check.
     * @param {string} [sensorLabel] - the sensor label, or default for the first one.
     * @returns {number} - the angle in the specified direction.
     * @private
     */
    _getTiltAngle (tiltDirection, sensorLabel = WeDo2TiltSensorLabel.DEFAULT) {
        const value = this._getTiltSensorValue(sensorLabel);
        const tiltX = value ? value.tiltX : 0;
        const tiltY = value ? value.tiltY : 0;
        switch (tiltDirection) {
        case WeDo2TiltDirection.UP: return tiltY;
        case WeDo2TiltDirection.DOWN: return -tiltY;
        case WeDo2TiltDirection.LEFT: return -tiltX;
        case WeDo2TiltDirection.RIGHT: return tiltX;
        default: return 0;
        }
    }

    /**
     * Test whether the tilt sensor is currently tilted.
     * @param {object} args - the block's arguments.
     * @returns {boolean} - true if the tilt sensor is tilted past a threshold.
     */
    whenTilted (args) {
        return this._isTilted(
            args && args.TILT_DIRECTION_ANY,
            args && args.TILT_SENSOR_ID
        );
    }

    /**
     * Test whether the tilt sensor is currently tilted.
     * @param {object} args - the block's arguments.
     * @returns {boolean} - true if the tilt sensor is tilted past a threshold.
     */
    isTilted (args) {
        return this._isTilted(
            args && args.TILT_DIRECTION_ANY,
            args && args.TILT_SENSOR_ID
        );
    }

    /**
     * Get tilt angle from specific tilt sensor.
     * @param {object} args - the block's arguments.
     * @returns {number} - the tilt sensor's angle in the specified direction.
     */
    getTiltAngle (args) {
        const value = this._getTiltAngle(
            args && args.TILT_DIRECTION,
            args && args.TILT_SENSOR_ID
        );
        // log.info('[WeDo2] getTiltAngle', args, '->', value);
        return value;
    }

    /**
     * Compare a distance sensor's value to a reference.
     * @param {object} args - the block's arguments.
     * @returns {boolean} - the result of the comparison, or false on error.
     */
    whenDistance (args) {
        return this._isDistance(args);
    }

    isDistance (args) {
        return this._isDistance(args);
    }

    /**
     * Compare a distance sensor's value to a reference.
     * @param {object} args - the block's arguments.
     * @returns {boolean} - the result of the comparison, or false on error.
     * @private
     */
    _isDistance (args) {
        const distanceValue = this._getDistanceSensorValue(args && args.DISTANCE_SENSOR);
        switch (args && args.OP) {
        case '<':
            return distanceValue < Cast.toNumber(args.REFERENCE);
        case '>':
            return distanceValue > Cast.toNumber(args.REFERENCE);
        default:
            log.warn(`Unknown comparison operator in isDistance: ${args && args.OP}`);
            return false;
        }
    }

    /**
     * @param {object} args - the block's arguments.
     * @returns {number} - the specified distance sensor's value, scaled to [0,100].
     */
    getDistance (args) {
        const value = this._getDistanceSensorValue(args && args.DISTANCE_SENSOR);
        // log.info('[WeDo2] getDistance', args, '->', value);
        return value;
    }

    /**
     * @param {number} midiNote - the MIDI note value to convert.
     * @returns {number} - the frequency, in Hz, corresponding to that MIDI note value.
     * @private
     */
    _noteToTone (midiNote) {
        // Note that MIDI note 69 is A4, 440 Hz
        return 440 * Math.pow(2, (midiNote - 69) / 12);
    }
}

// Factory function for extension loading compatibility
module.exports = Scratch3WeDo2Blocks;
