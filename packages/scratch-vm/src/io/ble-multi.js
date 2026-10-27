const JSONRPC = require('../util/jsonrpc');
const log = require('../util/log');

/**
 * A single, isolated WebSocket connection to one BLE device.
 */
class DeviceConnection extends JSONRPC {
    constructor (runtime, extensionId, deviceId, onDisconnect, onRequestError) {
        super();
        this._runtime = runtime;
        this._extensionId = extensionId;
        this.deviceId = deviceId;
        this._onDisconnect = onDisconnect;
        this._onRequestError = onRequestError;

        this._socket = runtime.getScratchLinkSocket('BLE');
        this._socket.setOnOpen(this._handleOpen.bind(this));
        this._socket.setOnClose(this._handleClose.bind(this));
        this._socket.setOnError(this._handleError.bind(this));
        this._socket.setHandleMessage(this._handleMessage.bind(this));

        this._sendMessage = this._socket.sendMessage.bind(this._socket);
        this._characteristicDidChangeCallback = null;
        this.connected = false;
        this._cancelled = false;

        this._socketOpenSettled = false;
        this._socketOpenPromise = new Promise((resolve, reject) => {
            this._socketOpenResolve = resolve;
            this._socketOpenReject = reject;
        });

        this._socket.open();
    }

    /**
     * Establishes the connection.
     * @param {number} [timeoutMs] - Time limit for the connect attempt.
     * @returns {Promise} - resolves once the connection is up.
     */
    connect (timeoutMs = 15000) {
        const timeout = new Promise((resolve, reject) => {
            this._connectTimeoutID = window.setTimeout(
                () => reject(new Error(`Connection attempt to ${this.deviceId} timed out`)),
                timeoutMs
            );
        });
        return Promise.race([
            this._socketOpenPromise
                .then(() => this.sendRemoteRequest('connect', { peripheralId: this.deviceId }))
                .then(() => {
                    this.connected = true;
                }),
            timeout
        ]).finally(() => {
            window.clearTimeout(this._connectTimeoutID);
        });
    }

    startNotifications (serviceId, characteristicId, onCharacteristicChanged = null) {
        log.info('[MultiBLE] DeviceConnection.startNotifications', this.deviceId, characteristicId);
        if (onCharacteristicChanged) {
            this._characteristicDidChangeCallback = onCharacteristicChanged;
        }
        return this.sendRemoteRequest('startNotifications', { serviceId, characteristicId });
    }

    stopNotifications (serviceId, characteristicId) {
        log.info('[MultiBLE] DeviceConnection.stopNotifications', this.deviceId, characteristicId);
        return this.sendRemoteRequest('stopNotifications', { serviceId, characteristicId });
    }

    read (serviceId, characteristicId, optStartNotifications = false, onCharacteristicChanged = null) {
        const params = { serviceId, characteristicId };
        if (optStartNotifications) params.startNotifications = true;
        if (onCharacteristicChanged) {
            this._characteristicDidChangeCallback = onCharacteristicChanged;
        }
        return this.sendRemoteRequest('read', params);
    }

    write (serviceId, characteristicId, message, encoding = null, withResponse = null) {
        // log.info('[MultiBLE] DeviceConnection.write', this.deviceId, characteristicId,
        //     {serviceId, message, encoding, withResponse});
        const params = { serviceId, characteristicId, message };
        if (encoding) params.encoding = encoding;
        if (withResponse !== null) params.withResponse = withResponse;
        return this.sendRemoteRequest('write', params);
    }

    /**
     * Handles calls from Scratch Link for this device only.
     */
    didReceiveCall (method, params) {
        switch (method) {
        case 'characteristicDidChange':
            log.info('[MultiBLE] characteristicDidChange', this.deviceId, params.characteristicId,
                'callbackSet:', Boolean(this._characteristicDidChangeCallback),
                'msgLen:', params.message ? params.message.length : 'n/a');
            if (this._characteristicDidChangeCallback) {
                this._characteristicDidChangeCallback(params.message, params.characteristicId);
            } else {
                log.warn('[MultiBLE] no characteristicDidChange callback for', this.deviceId, params.characteristicId);
            }
            break;
        case 'ping':
            return 42;
        }
    }

    disconnect () {
        this.connected = false;
        this._cancelled = true;
        if (this._socket.isOpen()) {
            this._socket.close();
        }
    }

    _handleClose () {
        this._failOpenRequests(new Error('Socket closed'));
        if (!this._socketOpenSettled) {
            this._socketOpenSettled = true;
            this._socketOpenReject(new Error('WebSocket closed before open'));
            return;
        }
        if (this.connected) {
            this.connected = false;
            this._onDisconnect(this.deviceId);
        }
    }

    _failOpenRequests (error) {
        for (const id of Object.keys(this._openRequests)) {
            this._openRequests[id].reject(error);
            delete this._openRequests[id];
        }
    }

    _handleError (e) {
        if (!this._socketOpenSettled) {
            this._socketOpenSettled = true;
            this._socketOpenReject(e);
            return;
        }
        this._onRequestError(this.deviceId, e);
    }

    _handleOpen () {
        this._socketOpenSettled = true;
        if (this._cancelled) {
            // Connection was cancelled before the socket finished opening
            this._socket.close();
            this._socketOpenReject(new Error('Connection attempt cancelled'));
            return;
        }
        this._socketOpenResolve();
    }
}


/**
 * Manager class controlling the discovery socket and all active `DeviceConnection` instances.
 */
class MultiBLE extends JSONRPC {

    constructor (runtime, extensionId, peripheralOptions, connectCallback, resetCallback = null) {
        super();

        this._runtime = runtime;
        this._extensionId = extensionId;
        this._peripheralOptions = peripheralOptions;
        this._connectCallback = connectCallback;
        this._resetCallback = resetCallback;

        this._availablePeripherals = {};
        this._discoverTimeoutID = null;
        this._discovering = false;

        // Map of all active device connections (deviceId -> DeviceConnection)
        this._connections = new Map();

        // Whether to resume scanning automatically after a successful connect
        this._wantDiscovery = true;

        // A dedicated socket used only for discovery/scanning
        this._openDiscoverySocket();
    }

    /**
     * Creates and opens the discovery socket (if not already present).
     * @private
     */
    _openDiscoverySocket () {
        this._discoverySocket = this._runtime.getScratchLinkSocket('BLE');
        // Transports that can only discover via a browser UI (Web Bluetooth
        // requestDevice picker) must not be re-triggered automatically.
        this._passiveDiscovery = this._discoverySocket.supportsPassiveDiscovery !== false;
        this._discoverySocket.setOnOpen(this.requestPeripheral.bind(this));
        this._discoverySocket.setOnClose(this._handleDiscoverTimeout.bind(this));
        this._discoverySocket.setOnError(e => this._handleRequestError(null, e));
        this._discoverySocket.setHandleMessage(this._handleMessage.bind(this));

        this._sendMessage = this._discoverySocket.sendMessage.bind(this._discoverySocket);

        this._discoverySocket.open();
    }

    /**
     * Starts (or resumes) discovery. Already connected devices stay connected.
     */
    startDiscovery () {
        this._wantDiscovery = true;
        if (this._discoverySocket) {
            // If the socket is still opening, requestPeripheral runs via onOpen.
            if (this._discoverySocket.isOpen()) {
                this.requestPeripheral();
            }
        } else {
            this._discovering = false;
            this._openDiscoverySocket();
        }
    }

    /**
     * Stops discovery and closes the discovery socket.
     * Existing device connections stay alive.
     */
    stopDiscovery () {
        this._wantDiscovery = false;
        this._discovering = false;
        if (this._discoverTimeoutID) {
            window.clearTimeout(this._discoverTimeoutID);
            this._discoverTimeoutID = null;
        }
        if (this._discoverySocket) {
            this._discoverySocket.close();
            this._discoverySocket = null;
        }
    }

    /**
     * Starts discovery over the discovery socket.
     */
    requestPeripheral () {
        // Keep already connected (or connecting) devices in the list so they
        // stay visible in the GUI.
        const previous = this._availablePeripherals;
        this._availablePeripherals = {};
        for (const [deviceId] of this._connections) {
            const known = previous[deviceId];
            this._availablePeripherals[deviceId] =
                known || {peripheralId: deviceId, name: deviceId, rssi: null};
        }
        this._runtime.emit(
            this._runtime.constructor.PERIPHERAL_LIST_UPDATE,
            this._availablePeripherals
        );

        if (this._discoverTimeoutID) {
            window.clearTimeout(this._discoverTimeoutID);
            this._discoverTimeoutID = null;
        }
        this._discoverTimeoutID = window.setTimeout(this._handleDiscoverTimeout.bind(this), 15000);

        if (this._discovering) {
            // log.info('[MultiBLE] requestPeripheral: discovery already in progress, not re-requesting');
            return;
        }

        this._discovering = true;
        this.sendRemoteRequest('discover', this._peripheralOptions)
            .then(() => {
                // The request was accepted; allow later re-scans (Refresh).
                // didDiscoverPeripheral notifications keep arriving while the
                // transport scans in the background.
                this._discovering = false;
            })
            .catch(e => {
                if (e && e.message && e.message.includes('already in progress')) {
                    // log.info('[MultiBLE] discover already in progress, continuing');
                    return;
                }
                this._discovering = false;
                this._handleRequestError(null, e);
            });
    }

    /**
     * Connects a specific peripheral by creating a new DeviceConnection.
     * @param {string|number} deviceId - the peripheral ID
     */
    connectPeripheral (deviceId) {
        log.info('[MultiBLE] connectPeripheral', deviceId);
        if (this._connections.has(deviceId)) {
            // log.info('[MultiBLE] connectPeripheral already connected', deviceId);
            return;
        }

        // Close the discovery socket so the adapter stops scanning before we connect
        this._closeDiscoverySocket();

        const connection = new DeviceConnection(
            this._runtime,
            this._extensionId,
            deviceId,
            this.handleDisconnectError.bind(this),
            this._handleRequestError.bind(this)
        );

        this._connections.set(deviceId, connection);

        connection.connect()
            .then(() => {
                if (this._connections.get(deviceId) !== connection) {
                    // Connection was already dropped again while connecting
                    return;
                }
                log.info('[MultiBLE] connected', deviceId);
                this._runtime.emit(this._runtime.constructor.PERIPHERAL_CONNECTED, { deviceId });
                if (this._connectCallback) {
                    this._connectCallback(deviceId);
                }
                this._resumeDiscoveryIfIdle();
            })
            .catch(e => {
                log.info('[MultiBLE] connection failed', deviceId, e);
                log.info('[MultiBLE] stack', e && e.stack);
                if (this._connections.get(deviceId) !== connection) {
                    // Connection was already dropped again while connecting
                    return;
                }
                // Remove the failed connection so the device can be retried
                connection.disconnect();
                this._connections.delete(deviceId);
                this._handleRequestError(deviceId, e);
                this._resumeDiscoveryIfIdle();
            });
    }

    /**
     * Closes the discovery socket (e.g. before a connect so the BLE adapter
     * does not scan and connect at the same time).
     * @private
     */
    _closeDiscoverySocket () {
        if (this._discoverySocket) {
            this._discoverySocket.close();
            this._discoverySocket = null;
        }
        if (this._discoverTimeoutID) {
            window.clearTimeout(this._discoverTimeoutID);
            this._discoverTimeoutID = null;
        }
        this._discovering = false;
    }

    /**
     * Resumes scanning once no connect is in flight, keeping the device list
     * in the connection dialog "live".
     * @private
     */
    _resumeDiscoveryIfIdle () {
        if (!this._wantDiscovery || this._passiveDiscovery === false) {
            // No passive scanning (e.g. Web Bluetooth picker-only): resuming
            // would pop a browser dialog without a user gesture. The user
            // restarts scanning explicitly via the Refresh button.
            return;
        }
        const anyPending = Array.from(this._connections.values())
            .some(conn => !conn.connected);
        if (!anyPending) {
            this.startDiscovery();
        }
    }

    /**
     * Keeps exactly the given set of peripherals connected.
     * Connects new ones and disconnects any currently connected not in the list.
     * @param {Array<string|number>} deviceIds - IDs of peripherals that should remain connected.
     */
    setConnectedPeripherals (deviceIds) {
        // log.info('[MultiBLE] setConnectedPeripherals', deviceIds);
        const currentIds = Array.from(this._connections.keys());
        for (const id of currentIds) {
            if (!deviceIds.includes(id)) {
                this.disconnect(id);
            }
        }
        for (const deviceId of deviceIds) {
            this.connectPeripheral(deviceId);
        }
    }

    /**
     * Returns the IDs of all currently connected peripherals.
     * @returns {Array<string|number>} - connected device IDs.
     */
    getConnectedDeviceIds () {
        const ids = Array.from(this._connections.keys())
            .filter(id => this.isConnected(id));
        // log.info('[MultiBLE] getConnectedDeviceIds:', ids);
        return ids;
    }

    // --- Delegation to the respective device ---

    startNotifications (deviceId, serviceId, characteristicId, onCharacteristicChanged = null) {
        const conn = this._connections.get(deviceId);
        if (!conn) return Promise.reject(`Device ${deviceId} not found`);
        return conn.startNotifications(serviceId, characteristicId, onCharacteristicChanged);
    }

    stopNotifications (deviceId, serviceId, characteristicId) {
        const conn = this._connections.get(deviceId);
        if (!conn) return Promise.reject(`Device ${deviceId} not found`);
        return conn.stopNotifications(serviceId, characteristicId);
    }

    read (deviceId, serviceId, characteristicId, optStartNotifications = false, onCharacteristicChanged = null) {
        const conn = this._connections.get(deviceId);
        if (!conn) return Promise.reject(`Device ${deviceId} not found`);
        return conn.read(serviceId, characteristicId, optStartNotifications, onCharacteristicChanged);
    }

    write (deviceId, serviceId, characteristicId, message, encoding = null, withResponse = null) {
        const conn = this._connections.get(deviceId);
        if (!conn) return Promise.reject(`Device ${deviceId} not found`);
        return conn.write(serviceId, characteristicId, message, encoding, withResponse);
    }

    isConnected (deviceId = null) {
        if (deviceId) {
            const conn = this._connections.get(deviceId);
            return conn ? conn.connected : false;
        }
        return Array.from(this._connections.values()).some(conn => conn.connected);
    }

    // --- Discovery message handling ---

    didReceiveCall (method, params) {
        // log.info('[MultiBLE] didReceiveCall', method, params);
        switch (method) {
        case 'didDiscoverPeripheral': {
            // A newly announced device without a name (e.g. from the BlueZ
            // cache) keeps its last known name.
            const previous = this._availablePeripherals[params.peripheralId];
            this._availablePeripherals[params.peripheralId] =
                (!params.name && previous && previous.name) ?
                    Object.assign({}, params, {name: previous.name}) :
                    params;
            this._runtime.emit(
                this._runtime.constructor.PERIPHERAL_LIST_UPDATE,
                this._availablePeripherals
            );
            if (this._discoverTimeoutID) window.clearTimeout(this._discoverTimeoutID);
            break;
        }
        case 'userDidPickPeripheral':
            this._availablePeripherals[params.peripheralId] = params;
            this._runtime.emit(
                this._runtime.constructor.USER_PICKED_PERIPHERAL,
                this._availablePeripherals
            );
            if (this._discoverTimeoutID) window.clearTimeout(this._discoverTimeoutID);
            break;
        case 'userDidNotPickPeripheral':
            this._runtime.emit(this._runtime.constructor.PERIPHERAL_SCAN_TIMEOUT);
            if (this._discoverTimeoutID) window.clearTimeout(this._discoverTimeoutID);
            break;
        }
    }

    // --- Disconnect & Cleanup ---

    disconnect (deviceId = null) {
        if (deviceId) {
            const conn = this._connections.get(deviceId);
            if (conn) {
                conn.disconnect();
                this._connections.delete(deviceId);
                this._runtime.emit(this._runtime.constructor.PERIPHERAL_DISCONNECTED, { deviceId });
                if (this._resetCallback) {
                    this._resetCallback(deviceId);
                }
                this._resumeDiscoveryIfIdle();
            }
        } else {
            for (const [id, conn] of this._connections.entries()) {
                conn.disconnect();
                this._runtime.emit(this._runtime.constructor.PERIPHERAL_DISCONNECTED, { deviceId: id });
            }
            this._connections.clear();

            this._wantDiscovery = false;
            this._discovering = false;
            if (this._discoverySocket && this._discoverySocket.isOpen()) {
                this._discoverySocket.close();
            }
            this._discoverySocket = null;
            if (this._discoverTimeoutID) {
                window.clearTimeout(this._discoverTimeoutID);
                this._discoverTimeoutID = null;
            }
        }
    }

    handleDisconnectError (deviceId) {
        this.disconnect(deviceId);

        this._runtime.emit(this._runtime.constructor.PERIPHERAL_CONNECTION_LOST_ERROR, {
            message: `Connection to ${deviceId} lost`,
            extensionId: this._extensionId,
            deviceId
        });
    }

    _handleRequestError (deviceId, /* e */) {
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_REQUEST_ERROR, {
            message: `Request to ${deviceId || 'discovery'} failed`,
            extensionId: this._extensionId,
            deviceId
        });
    }

    _handleDiscoverTimeout () {
        if (!this._discoverTimeoutID) {
            return;
        }
        this._discoverTimeoutID = null;
        this._discovering = false;
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_SCAN_TIMEOUT);
    }
}

module.exports = MultiBLE;
