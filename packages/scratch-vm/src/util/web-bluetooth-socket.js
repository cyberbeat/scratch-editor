const Base64Util = require('./base64-util');
const log = require('./log');

/**
 * Registry of BluetoothDevice objects known to this browsing session.
 * The discovery socket fills it (requestLEScan / getDevices / requestDevice);
 * device session sockets look their peripheralId up here on 'connect'.
 * @type {Map<string, BluetoothDevice>}
 */
const deviceRegistry = new Map();

/**
 * Cached result of navigator.bluetooth.getAvailability(). Starts as `undefined`
 * (unknown); a one-time async check updates it so that isAvailable() can stay
 * synchronous for the socket factory.
 * @type {boolean|undefined}
 */
let cachedAdapterAvailability;

/**
 * Shared LE scan state. Discovery sockets come and go (MultiBLE closes the
 * discovery socket while connecting, then opens a fresh one), but the browser
 * scan can outlive a single socket: a new socket re-subscribes to a running
 * scan without calling requestLEScan() again — which matters because
 * requestLEScan() may require transient user activation.
 */
const sharedScan = {
    scan: null,
    scanRequest: null,
    /** @type {Set<WebBluetoothSocket>} */
    subscribers: new Set(),
    advListener: null,
    announced: new Map(), // deviceId -> last announce time (ms)
    stopTimer: null
};

/**
 * ScratchLinkSocket implementation backed by the browser's Web Bluetooth API.
 * Each instance emulates one scratch-link websocket: outgoing JSON-RPC requests
 * arrive via sendMessage(), responses and notifications are fed back through
 * the message handler set by setHandleMessage().
 *
 * A socket instance is used either as a discovery socket ('discover' calls) or
 * as a per-device session socket ('connect', 'read', 'write', notifications).
 * This mirrors the scratch-link session model and supports multiple devices
 * simultaneously, since each session socket owns its own GATT connection.
 */
class WebBluetoothSocket {
    constructor () {
        this._onOpen = null;
        this._onClose = null;
        this._onError = null;
        this._handleMessage = null;

        this._open = false;
        this._closed = false;

        // per-session state (device sockets)
        this._device = null;
        this._notifyHandlers = new Map(); // "serviceId:characteristicId" -> {characteristic, handler}

        // discovery state lives in the module-level sharedScan object

        this._onGattDisconnected = this._handleGattDisconnect.bind(this);
    }

    /**
     * Whether this transport can discover peripherals without showing a
     * browser UI. False when only requestDevice (the system picker) exists —
     * used by MultiBLE to skip automatic scan resumption, since a picker
     * popping up without a user click would be disruptive.
     * @returns {boolean} - true when silent scanning is possible.
     */
    get supportsPassiveDiscovery () {
        return typeof navigator.bluetooth.requestLEScan === 'function';
    }

    /**
     * Whether the Web Bluetooth transport is enabled at all. It is opt-in
     * because browsers without requestLEScan show an intrusive pairing dialog
     * on every scan. Enable via URL param `?webbt` (or `?webbt=1`) or
     * persistently via `localStorage.setItem('scratch-webbt', '1')`.
     * @returns {boolean} - true when the user opted in.
     */
    static isEnabled () {
        if (typeof window === 'undefined') {
            return false;
        }
        if (typeof window.location !== 'undefined' &&
            /[?&]webbt(=1|=true)?(?=&|$)/.test(window.location.search)) {
            return true;
        }
        try {
            return Boolean(window.localStorage) &&
                window.localStorage.getItem('scratch-webbt') === '1';
        } catch (e) {
            void e; // localStorage access can throw (privacy mode); treat as disabled
            return false;
        }
    }

    /**
     * Whether the Web Bluetooth API can serve as the scratch-link transport.
     * Requires navigator.bluetooth to exist and (once known) an enabled adapter.
     * @returns {boolean} - true when Web Bluetooth is usable.
     */
    static isAvailable () {
        if (typeof navigator === 'undefined' || !navigator.bluetooth) {
            return false;
        }
        if (typeof cachedAdapterAvailability === 'undefined' &&
            typeof navigator.bluetooth.getAvailability === 'function') {
            navigator.bluetooth.getAvailability()
                .then(available => {
                    cachedAdapterAvailability = available;
                })
                .catch(() => {
                    // Leave undefined: optimistically assume availability
                });
        }
        return cachedAdapterAvailability !== false;
    }

    open () {
        if (!(this._onOpen && this._onClose && this._onError && this._handleMessage)) {
            throw new Error('Must set open, close, message and error handlers before calling open on the socket');
        }
        // There is no transport to establish: report open asynchronously,
        // matching the websocket behaviour.
        Promise.resolve().then(() => {
            if (this._closed) return;
            this._open = true;
            this._onOpen();
        });
    }

    close () {
        if (this._closed) return;
        this._closed = true;
        this._open = false;

        this._unsubscribeScan();

        for (const {characteristic, handler} of this._notifyHandlers.values()) {
            characteristic.removeEventListener('characteristicvaluechanged', handler);
        }
        this._notifyHandlers.clear();

        if (this._device) {
            this._device.removeEventListener('gattserverdisconnected', this._onGattDisconnected);
            if (this._device.gatt && this._device.gatt.connected) {
                this._device.gatt.disconnect();
            }
            this._device = null;
        }

        const onClose = this._onClose;
        Promise.resolve().then(() => {
            if (onClose) onClose();
        });
    }

    isOpen () {
        return this._open;
    }

    setOnOpen (fn) {
        this._onOpen = fn;
    }

    setOnClose (fn) {
        this._onClose = fn;
    }

    setOnError (fn) {
        this._onError = fn;
    }

    setHandleMessage (fn) {
        this._handleMessage = fn;
    }

    /**
     * Handle one outgoing JSON-RPC request object.
     * @param {object} json - the JSON-RPC message ({jsonrpc, method, params, id}).
     */
    sendMessage (json) {
        if (!this._open || this._closed) {
            throw new Error('WebBluetoothSocket is not open');
        }
        if (!Object.prototype.hasOwnProperty.call(json, 'method')) {
            // Responses from the client side are not expected; ignore.
            return;
        }
        const {method, params, id} = json;
        this._dispatch(method, params || {})
            .then(result => this._respond(id, result),
                error => this._respond(id, null, error));
    }

    // --- JSON-RPC plumbing ---

    _respond (id, result, error) {
        if (id === null || typeof id === 'undefined') return;
        const response = {jsonrpc: '2.0', id};
        if (error) {
            response.error = {
                code: -32603,
                message: error && error.message ? error.message : String(error)
            };
        } else {
            response.result = result || null;
        }
        this._handleMessage(response);
    }

    _notify (method, params) {
        this._handleMessage({
            jsonrpc: '2.0',
            method,
            params
        });
    }

    _dispatch (method, params) {
        switch (method) {
        case 'getVersion':
            return Promise.resolve({protocol: '1.3'});
        case 'discover':
            return this._discover(params);
        case 'connect':
            return this._connect(params.peripheralId);
        case 'disconnect':
            this._disconnectDevice();
            return Promise.resolve(null);
        case 'read':
            return this._read(params);
        case 'write':
            return this._write(params);
        case 'startNotifications':
            return this._startNotifications(params);
        case 'stopNotifications':
            return this._stopNotifications(params);
        case 'getServices':
            return this._getServices();
        case 'getCharacteristics':
            return this._getCharacteristics(params.serviceId);
        case 'ping':
            return Promise.resolve(42);
        default:
            return Promise.reject(new Error(`Method not found: ${method}`));
        }
    }

    // --- Discovery (used by the MultiBLE discovery socket) ---

    async _discover (params) {
        log.info('[WebBT] discover', params,
            'LEScan:', typeof navigator.bluetooth.requestLEScan,
            'getDevices:', typeof navigator.bluetooth.getDevices);

        // Re-announce every device known from earlier scans/picks so the GUI
        // list repopulates after the discovery socket was recycled.
        for (const device of deviceRegistry.values()) {
            this._announceDevice(device);
        }

        // Surface devices the user already granted access to
        if (typeof navigator.bluetooth.getDevices === 'function') {
            try {
                const granted = await navigator.bluetooth.getDevices();
                granted.forEach(device => this._announceDevice(device));
            } catch (e) {
                void e; // getDevices can fail without user activation; not fatal
            }
        }

        // Subscribe this socket to the shared advertisement stream. A scan
        // that is already running keeps running while sockets come and go.
        sharedScan.subscribers.add(this);
        if (sharedScan.stopTimer) {
            clearTimeout(sharedScan.stopTimer);
            sharedScan.stopTimer = null;
        }
        if (sharedScan.scan) {
            return null; // already scanning; future advertisements will arrive
        }

        if (typeof navigator.bluetooth.requestLEScan === 'function') {
            if (sharedScan.scanRequest) {
                // Another discover call is already starting the scan; the
                // advertisements will reach this socket via the subscription.
                try {
                    await sharedScan.scanRequest;
                } catch (e) {
                    void e; // the owner handles the failure
                }
                return null;
            }
            try {
                sharedScan.advListener = event => this._handleAdvertisement(event);
                navigator.bluetooth.addEventListener('advertisementreceived', sharedScan.advListener);
                sharedScan.scanRequest = navigator.bluetooth.requestLEScan({
                    filters: params.filters,
                    optionalServices: params.optionalServices,
                    keepRepeatedDevices: true,
                    acceptAllDevices: false
                });
                const scan = await sharedScan.scanRequest;
                // eslint-disable-next-line require-atomic-updates
                sharedScan.scan = scan;
                log.info('[WebBT] requestLEScan started');
                return null;
            } catch (e) {
                // requestLEScan can exist but be unavailable (flag off, denied,
                // no user activation). Fall through to the picker instead of
                // failing the whole discover request.
                log.info('[WebBT] requestLEScan failed, falling back to requestDevice', e);
                if (sharedScan.advListener) {
                    navigator.bluetooth.removeEventListener('advertisementreceived', sharedScan.advListener);
                    sharedScan.advListener = null;
                }
                sharedScan.scan = null;
            } finally {
                // eslint-disable-next-line require-atomic-updates
                sharedScan.scanRequest = null;
            }
        }

        // Fallback: the system device picker. Requires transient user
        // activation (a click); without it the promise rejects, which we map
        // to 'userDidNotPickPeripheral' (= scan timeout) rather than an error.
        const hasActivation = typeof navigator.userActivation === 'undefined' ||
            navigator.userActivation.isActive;
        if (!hasActivation) {
            log.info('[WebBT] no user activation, skipping requestDevice picker');
            this._notify('userDidNotPickPeripheral', {});
            return null;
        }
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: params.filters,
                optionalServices: params.optionalServices
            });
            this._announceDevice(device);
        } catch (e) {
            log.info('[WebBT] requestDevice failed/cancelled', e);
            this._notify('userDidNotPickPeripheral', {});
        }
        return null;
    }

    _announceDevice (device, rssi, advName) {
        deviceRegistry.set(device.id, device);
        this._notify('didDiscoverPeripheral', {
            peripheralId: device.id,
            name: device.name || advName || null,
            rssi: typeof rssi === 'number' ? rssi : null
        });
    }

    _handleAdvertisement (event) {
        const device = event.device;
        deviceRegistry.set(device.id, device);
        // Advertisements arrive per packet; throttle so each device updates
        // the GUI at most every ~1.5s.
        const now = Date.now();
        const last = sharedScan.announced.get(device.id) || 0;
        if (now - last < 1500) return;
        sharedScan.announced.set(device.id, now);
        for (const socket of sharedScan.subscribers) {
            socket._announceDevice(device, event.rssi, event.name);
        }
    }

    _unsubscribeScan () {
        sharedScan.subscribers.delete(this);
        if (sharedScan.subscribers.size > 0 || !sharedScan.scan || sharedScan.stopTimer) {
            return;
        }
        // Keep the scan alive briefly: MultiBLE closes the discovery socket
        // while connecting and immediately opens a new one; reusing the
        // still-running scan avoids another (gesture-requiring) requestLEScan.
        sharedScan.stopTimer = window.setTimeout(() => {
            sharedScan.stopTimer = null;
            if (sharedScan.subscribers.size === 0 && sharedScan.scan) {
                try {
                    sharedScan.scan.stop();
                } catch (e) {
                    void e; // scan already stopped
                }
                sharedScan.scan = null;
                if (sharedScan.advListener) {
                    navigator.bluetooth.removeEventListener('advertisementreceived', sharedScan.advListener);
                    sharedScan.advListener = null;
                }
            }
        }, 30000);
    }

    // --- Device session (used by DeviceConnection sockets) ---

    async _connect (peripheralId) {
        const device = deviceRegistry.get(peripheralId);
        if (!device) {
            throw new Error(`Unknown device: ${peripheralId}`);
        }
        this._device = device;
        device.addEventListener('gattserverdisconnected', this._onGattDisconnected);
        log.info('[WebBT] gatt.connect', peripheralId);
        await device.gatt.connect();
        if (this._closed) {
            // The socket was cancelled while the GATT connect was in flight;
            // don't leave a zombie connection behind.
            this._disconnectDevice();
            throw new Error('Connection cancelled');
        }
        log.info('[WebBT] gatt connected', peripheralId);
        return null;
    }

    _disconnectDevice () {
        const device = this._device;
        if (!device) return;
        device.removeEventListener('gattserverdisconnected', this._onGattDisconnected);
        if (device.gatt && device.gatt.connected) {
            device.gatt.disconnect();
        }
    }

    _handleGattDisconnect () {
        log.info('[WebBT] gattserverdisconnected', this._device && this._device.id);
        if (this._closed) return;
        this._closed = true;
        this._open = false;
        if (this._onClose) this._onClose();
    }

    _requireServer () {
        if (!this._device || !this._device.gatt || !this._device.gatt.connected) {
            throw new Error('Device not connected');
        }
        return this._device.gatt;
    }

    async _getCharacteristic (serviceId, characteristicId) {
        const gatt = this._requireServer();
        const service = await gatt.getPrimaryService(serviceId);
        return service.getCharacteristic(characteristicId);
    }

    async _read (params) {
        const characteristic = await this._getCharacteristic(params.serviceId, params.characteristicId);
        const value = await characteristic.readValue();
        if (params.startNotifications) {
            await this._subscribeNotifications(params.serviceId, characteristic);
        }
        return {
            result: Base64Util.uint8ArrayToBase64(new Uint8Array(value.buffer)),
            encoding: 'base64'
        };
    }

    async _write (params) {
        const characteristic = await this._getCharacteristic(params.serviceId, params.characteristicId);
        const bytes = params.encoding === 'base64' ?
            Base64Util.base64ToUint8Array(params.message) :
            new Uint8Array(params.message);
        if (params.withResponse === false && characteristic.properties.writeWithoutResponse) {
            await characteristic.writeValueWithoutResponse(bytes);
        } else {
            await characteristic.writeValueWithResponse(bytes);
        }
        return bytes.length;
    }

    async _startNotifications (params) {
        const characteristic = await this._getCharacteristic(params.serviceId, params.characteristicId);
        await this._subscribeNotifications(params.serviceId, characteristic);
        return null;
    }

    async _subscribeNotifications (serviceId, characteristic) {
        const key = `${serviceId}:${characteristic.uuid}`;
        if (this._notifyHandlers.has(key)) {
            return;
        }
        // Register the notification listener BEFORE startNotifications() so
        // that values arriving right after the CCCD write (e.g. the WeDo
        // ATTACHED_IO port table) are not dropped.
        const handler = event => {
            this._notify('characteristicDidChange', {
                serviceId,
                characteristicId: characteristic.uuid,
                message: Base64Util.uint8ArrayToBase64(new Uint8Array(event.target.value.buffer)),
                encoding: 'base64'
            });
        };
        characteristic.addEventListener('characteristicvaluechanged', handler);
        this._notifyHandlers.set(key, {characteristic, handler});
        try {
            await characteristic.startNotifications();
        } catch (e) {
            characteristic.removeEventListener('characteristicvaluechanged', handler);
            this._notifyHandlers.delete(key);
            throw e;
        }
    }

    async _stopNotifications (params) {
        const key = `${params.serviceId}:${params.characteristicId}`;
        const entry = this._notifyHandlers.get(key);
        if (entry) {
            entry.characteristic.removeEventListener('characteristicvaluechanged', entry.handler);
            this._notifyHandlers.delete(key);
            await entry.characteristic.stopNotifications();
        }
        return null;
    }

    async _getServices () {
        const gatt = this._requireServer();
        const services = await gatt.getPrimaryServices();
        return services.map(service => service.uuid);
    }

    async _getCharacteristics (serviceId) {
        const gatt = this._requireServer();
        const service = await gatt.getPrimaryService(serviceId);
        const characteristics = await service.getCharacteristics();
        return characteristics.map(characteristic => characteristic.uuid);
    }
}

module.exports = WebBluetoothSocket;
