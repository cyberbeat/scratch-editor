import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import ScanningStepComponent from '../components/connection-modal/scanning-step.jsx';
import VM from '@scratch/scratch-vm';

/**
 * Scan for a peripheral and allow the user to choose from a list of those discovered.
 * Does not support "prescan" and "pressbutton" phases.
 *
 * For extensions with `multipleDevices` (e.g. WeDo 2.0 multi-hub), each discovered
 * peripheral can be connected/disconnected individually with a single click while
 * the dialog stays open.
 */
class ScanningStep extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handlePeripheralListUpdate',
            'handlePeripheralScanTimeout',
            'handleUserPickedPeripheral',
            'handleRefresh',
            'handlePeripheralConnected',
            'handlePeripheralDisconnected',
            'handlePeripheralRequestError',
            'handlePeripheralToggle'
        ]);
        this.state = {
            scanning: true,
            peripheralList: [],
            connectingDevices: [],
            connectedDevices: this.props.vm.getConnectedPeripherals(this.props.extensionId) || []
        };
        // Last-seen display names per peripheralId (devices may later be reported
        // without a name, e.g. when they come from the adapter's cache)
        this._deviceNames = {};
    }
    componentDidMount () {
        this.props.vm.on(
            'PERIPHERAL_LIST_UPDATE', this.handlePeripheralListUpdate);
        this.props.vm.on(
            'PERIPHERAL_SCAN_TIMEOUT', this.handlePeripheralScanTimeout);
        this.props.vm.on(
            'USER_PICKED_PERIPHERAL', this.handleUserPickedPeripheral);
        this.props.vm.on(
            'PERIPHERAL_CONNECTED', this.handlePeripheralConnected);
        this.props.vm.on(
            'PERIPHERAL_DISCONNECTED', this.handlePeripheralDisconnected);
        this.props.vm.on(
            'PERIPHERAL_CONNECTION_LOST_ERROR', this.handlePeripheralDisconnected);
        this.props.vm.on(
            'PERIPHERAL_REQUEST_ERROR', this.handlePeripheralRequestError);
        this.props.vm.scanForPeripheral(this.props.extensionId);
    }
    componentWillUnmount () {
        // @todo: stop the peripheral scan here
        this.props.vm.removeListener(
            'PERIPHERAL_LIST_UPDATE', this.handlePeripheralListUpdate);
        this.props.vm.removeListener(
            'PERIPHERAL_SCAN_TIMEOUT', this.handlePeripheralScanTimeout);
        this.props.vm.removeListener(
            'USER_PICKED_PERIPHERAL', this.handleUserPickedPeripheral);
        this.props.vm.removeListener(
            'PERIPHERAL_CONNECTED', this.handlePeripheralConnected);
        this.props.vm.removeListener(
            'PERIPHERAL_DISCONNECTED', this.handlePeripheralDisconnected);
        this.props.vm.removeListener(
            'PERIPHERAL_CONNECTION_LOST_ERROR', this.handlePeripheralDisconnected);
        this.props.vm.removeListener(
            'PERIPHERAL_REQUEST_ERROR', this.handlePeripheralRequestError);
        // Abort in-progress connection attempts when the dialog closes
        if (this.props.multipleDevices) {
            this.state.connectingDevices.forEach(deviceId => {
                this.props.vm.disconnectPeripheral(this.props.extensionId, deviceId);
            });
        }
    }
    /**
     * Turns a raw peripheralId (e.g. a BlueZ D-Bus path like
     * "/org/bluez/hci0/dev_AA_BB_CC_DD_EE_FF") into a readable label.
     * @param {string} peripheralId - the peripheral id
     * @returns {string} - a human readable name
     */
    _displayNameFor (peripheralId) {
        const knownName = this._deviceNames[peripheralId];
        if (knownName) return knownName;
        if (peripheralId && peripheralId.indexOf('/org/') === 0) {
            const devPart = peripheralId.split('/').pop() || '';
            return devPart.replace(/^dev_/, '').replace(/_/g, ':') || peripheralId;
        }
        return peripheralId;
    }
    handlePeripheralScanTimeout () {
        this.setState({
            scanning: false,
            peripheralList: []
        });
    }
    handlePeripheralListUpdate (newList) {
        // TODO: sort peripherals by signal strength? so they don't jump around
        const peripheralArray = Object.keys(newList).map(id =>
            newList[id]
        );
        peripheralArray.forEach(peripheral => {
            if (peripheral.name && peripheral.name.indexOf('/org/') !== 0) {
                this._deviceNames[peripheral.peripheralId] = peripheral.name;
            }
        });
        this.setState({peripheralList: peripheralArray});
    }
    handleUserPickedPeripheral (newList) {
        const peripheralArray = Object.keys(newList).map(id =>
            newList[id]
        );
        this.setState({peripheralList: peripheralArray});
        if (peripheralArray.length > 0) {
            this.props.onConnecting(peripheralArray[0].peripheralId);
        }
    }
    handlePeripheralConnected (data) {
        const deviceId = data && data.deviceId;
        if (typeof deviceId === 'undefined' || deviceId === null) return;
        this.setState(prevState => ({
            connectingDevices: prevState.connectingDevices.filter(id => id !== deviceId),
            connectedDevices: prevState.connectedDevices.includes(deviceId) ?
                prevState.connectedDevices :
                [...prevState.connectedDevices, deviceId]
        }));
    }
    handlePeripheralDisconnected (data) {
        const deviceId = data && data.deviceId;
        if (typeof deviceId === 'undefined' || deviceId === null) return;
        this.setState(prevState => ({
            connectingDevices: prevState.connectingDevices.filter(id => id !== deviceId),
            connectedDevices: prevState.connectedDevices.filter(id => id !== deviceId)
        }));
    }
    handlePeripheralRequestError (data) {
        const deviceId = data && data.deviceId;
        if (typeof deviceId === 'undefined' || deviceId === null) return;
        // A failed connection attempt only resets that device's tile
        this.setState(prevState => ({
            connectingDevices: prevState.connectingDevices.filter(id => id !== deviceId)
        }));
    }
    handleRefresh () {
        this.setState({
            scanning: true,
            peripheralList: []
        });
        this.props.vm.scanForPeripheral(this.props.extensionId);
    }
    handlePeripheralToggle (peripheralId) {
        const {connectedDevices, connectingDevices} = this.state;
        if (connectedDevices.includes(peripheralId)) {
            // Optimistically remove; PERIPHERAL_DISCONNECTED confirms it
            this.setState(prevState => ({
                connectedDevices: prevState.connectedDevices.filter(id => id !== peripheralId)
            }));
            this.props.vm.disconnectPeripheral(this.props.extensionId, peripheralId);
        } else if (connectingDevices.includes(peripheralId)) {
            // Cancel the in-progress connection attempt
            this.setState(prevState => ({
                connectingDevices: prevState.connectingDevices.filter(id => id !== peripheralId)
            }));
            this.props.vm.disconnectPeripheral(this.props.extensionId, peripheralId);
        } else {
            this.setState(prevState => ({
                connectingDevices: [...prevState.connectingDevices, peripheralId]
            }));
            this.props.vm.connectPeripheral(this.props.extensionId, peripheralId);
        }
    }
    render () {
        // Merge connected/connecting devices into the tile list, so hubs that are
        // already connected (but e.g. no longer advertising) remain visible.
        const knownIds = new Set(this.state.peripheralList.map(p => p.peripheralId));
        const extraDevices = [...this.state.connectedDevices, ...this.state.connectingDevices]
            .filter(id => !knownIds.has(id))
            .map(id => ({peripheralId: id, name: this._displayNameFor(id), rssi: null}));
        const peripheralList = [...this.state.peripheralList, ...extraDevices];
        return (
            <ScanningStepComponent
                connectionSmallIconURL={this.props.connectionSmallIconURL}
                peripheralList={peripheralList}
                phase={this.state.phase}
                scanning={this.state.scanning}
                title={this.props.extensionId}
                onConnected={this.props.onConnected}
                onConnecting={this.props.onConnecting}
                onRefresh={this.handleRefresh}
                onUpdatePeripheral={this.props.onUpdatePeripheral}
                multipleDevices={this.props.multipleDevices}
                connectedDevices={this.state.connectedDevices}
                connectingDevices={this.state.connectingDevices}
                onPeripheralToggle={this.handlePeripheralToggle}
            />
        );
    }
}

ScanningStep.propTypes = {
    connectionSmallIconURL: PropTypes.string,
    extensionId: PropTypes.string.isRequired,
    multipleDevices: PropTypes.bool,
    onConnected: PropTypes.func.isRequired,
    onConnecting: PropTypes.func.isRequired,
    onUpdatePeripheral: PropTypes.func,
    vm: PropTypes.instanceOf(VM).isRequired
};

ScanningStep.defaultProps = {
    multipleDevices: false
};

export default ScanningStep;
