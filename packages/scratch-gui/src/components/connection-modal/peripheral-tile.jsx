import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import React from 'react';
import bindAll from 'lodash.bindall';
import Box from '../box/box.jsx';

import styles from './connection-modal.css';

class PeripheralTile extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleConnecting',
            'handleTileClick',
            'handleActionClick'
        ]);
    }
    handleConnecting () {
        this.props.onConnecting(this.props.peripheralId);
    }
    handleTileClick () {
        // In multi-device mode the whole tile is clickable to connect a device
        // or to cancel an in-progress connection attempt.
        if (this.props.multipleDevices && this.props.status !== 'connected') {
            this.props.onPeripheralToggle(this.props.peripheralId);
        }
    }
    handleActionClick (e) {
        e.stopPropagation();
        this.props.onPeripheralToggle(this.props.peripheralId);
    }
    render () {
        const {multipleDevices, status} = this.props;
        return (
            <Box
                className={classNames(styles.peripheralTile, {
                    [styles.peripheralTileClickable]: multipleDevices && status === 'available',
                    [styles.peripheralTileConnected]: multipleDevices && status === 'connected'
                })}
                onClick={this.handleTileClick}
            >
                <Box className={styles.peripheralTileName}>
                    <img
                        className={styles.peripheralTileImage}
                        src={this.props.connectionSmallIconURL}
                    />
                    <Box className={styles.peripheralTileNameWrapper}>
                        <Box className={styles.peripheralTileNameLabel}>
                            <FormattedMessage
                                defaultMessage="Device name"
                                description="Label for field showing the device name"
                                id="gui.connection.peripheral-name-label"
                            />
                        </Box>
                        <Box className={styles.peripheralTileNameText}>
                            {this.props.name}
                        </Box>
                    </Box>
                </Box>
                <Box className={styles.peripheralTileWidgets}>
                    {multipleDevices && status === 'connecting' && (
                        <Box className={styles.tileStatusIndicator}>
                            <span className={styles.tileSpinner} />
                            <FormattedMessage
                                defaultMessage="Connecting"
                                description="Label shown while a device is connecting"
                                id="gui.connection.connectingLabel"
                            />
                        </Box>
                    )}
                    {multipleDevices && status === 'connected' && (
                        <Box className={classNames(styles.tileStatusIndicator, styles.tileConnectedText)}>
                            <FormattedMessage
                                defaultMessage="Connected"
                                description="Label shown for a connected device"
                                id="gui.connection.connectedLabel"
                            />
                        </Box>
                    )}
                    <Box className={styles.signalStrengthMeter}>
                        <div
                            className={classNames(styles.signalBar, {
                                [styles.greenBar]: this.props.rssi > -80
                            })}
                        />
                        <div
                            className={classNames(styles.signalBar, {
                                [styles.greenBar]: this.props.rssi > -60
                            })}
                        />
                        <div
                            className={classNames(styles.signalBar, {
                                [styles.greenBar]: this.props.rssi > -40
                            })}
                        />
                        <div
                            className={classNames(styles.signalBar, {
                                [styles.greenBar]: this.props.rssi > -20
                            })}
                        />
                    </Box>
                    {multipleDevices ? (
                        status === 'connected' ? (
                            <button
                                className={classNames(styles.connectionButton, styles.disconnectButton)}
                                onClick={this.handleActionClick}
                            >
                                <FormattedMessage
                                    defaultMessage="Disconnect"
                                    description="Button to disconnect a connected device"
                                    id="gui.connection.disconnect"
                                />
                            </button>
                        ) : status === 'connecting' ? (
                            <button
                                className={styles.connectionButton}
                                onClick={this.handleActionClick}
                            >
                                <FormattedMessage
                                    defaultMessage="Cancel"
                                    description="Button to cancel an in-progress connection attempt"
                                    id="gui.connection.cancelConnecting"
                                />
                            </button>
                        ) : (
                            <button onClick={this.handleActionClick}>
                                <FormattedMessage
                                    defaultMessage="Connect"
                                    description="Button to start connecting to a specific device"
                                    id="gui.connection.connect"
                                />
                            </button>
                        )
                    ) : (
                        <button
                            onClick={this.handleConnecting}
                        >
                            <FormattedMessage
                                defaultMessage="Connect"
                                description="Button to start connecting to a specific device"
                                id="gui.connection.connect"
                            />
                        </button>
                    )}
                </Box>
            </Box>
        );
    }
}

PeripheralTile.propTypes = {
    connectionSmallIconURL: PropTypes.string,
    multipleDevices: PropTypes.bool,
    name: PropTypes.string,
    onConnecting: PropTypes.func,
    onPeripheralToggle: PropTypes.func,
    peripheralId: PropTypes.string,
    rssi: PropTypes.number,
    status: PropTypes.oneOf(['available', 'connecting', 'connected'])
};

PeripheralTile.defaultProps = {
    multipleDevices: false,
    status: 'available'
};

export default PeripheralTile;
