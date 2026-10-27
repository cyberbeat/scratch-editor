import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import BalancedFormattedMessage from '../../containers/balanced-formatted-message.jsx';
import Box from '../box/box.jsx';
import PeripheralTile from './peripheral-tile.jsx';
import Dots from './dots.jsx';

import enterUpdateIcon from './icons/enter-update.svg';
import radarIcon from './icons/searching.png';
import refreshIcon from './icons/refresh.svg';
import warningIcon from './icons/warning.svg';

import styles from './connection-modal.css';

const ScanningStep = ({
    connectedDevices,
    connectingDevices,
    connectionSmallIconURL,
    multipleDevices,
    onConnecting,
    onPeripheralToggle,
    onRefresh,
    onUpdatePeripheral,
    peripheralList,
    scanning
}) => {
    const showUpdate = Boolean(onUpdatePeripheral && !scanning);
    const hasDevices = peripheralList.length > 0;

    return (
        <Box className={styles.body}>
            <Box className={styles.activityArea}>
                {hasDevices ? (
                    <div className={styles.peripheralTilePane}>
                        {peripheralList.map(peripheral => (
                            <PeripheralTile
                                connectionSmallIconURL={connectionSmallIconURL}
                                key={peripheral.peripheralId}
                                multipleDevices={multipleDevices}
                                name={peripheral.name}
                                onConnecting={onConnecting}
                                onPeripheralToggle={onPeripheralToggle}
                                peripheralId={peripheral.peripheralId}
                                rssi={peripheral.rssi}
                                status={
                                    (connectedDevices && connectedDevices.includes(peripheral.peripheralId)) ?
                                        'connected' :
                                        ((connectingDevices && connectingDevices.includes(peripheral.peripheralId)) ?
                                            'connecting' :
                                            'available')
                                }
                            />
                        ))}
                    </div>
                ) : (
                    scanning ? (
                        <div className={styles.activityAreaInfo}>
                            <div className={styles.centeredRow}>
                                <img
                                    className={classNames(styles.radarSmall, styles.radarSpin)}
                                    src={radarIcon}
                                />
                                <FormattedMessage
                                    defaultMessage="Looking for devices"
                                    description="Text shown while scanning for devices"
                                    id="gui.connection.scanning.lookingforperipherals"
                                />
                            </div>
                        </div>
                    ) : (
                        <Box className={styles.centeredRow}>
                            <img
                                className={styles.helpStepImage}
                                src={warningIcon}
                            />
                            <FormattedMessage
                                className={styles.helpStepText}
                                defaultMessage="No devices found"
                                description="Text shown when no devices could be found"
                                id="gui.connection.scanning.noPeripheralsFound"
                            />
                        </Box>
                    )
                )}
            </Box>

            <Box className={styles.bottomArea}>
                <Box className={classNames(styles.bottomAreaItem, styles.instructions)}>
                    {(scanning || hasDevices) && (
                        multipleDevices ? (
                            <FormattedMessage
                                defaultMessage="Click a device to connect it. Click 'Disconnect' to remove it."
                                description="Prompt for connecting/disconnecting multiple devices"
                                id="gui.connection.scanning.instructionsMultiple"
                            />
                        ) : (
                            <FormattedMessage
                                defaultMessage="Select your device in the list above."
                                description="Prompt for choosing a single device to connect to"
                                id="gui.connection.scanning.instructions"
                            />
                        )
                    )}
                    {showUpdate && (
                        <BalancedFormattedMessage
                            // eslint-disable-next-line max-len
                            defaultMessage="If you don't see your device, you may need to update it to work with Scratch."
                            description="Prompt for updating a peripheral device"
                            id="gui.connection.scanning.updatePeripheralPrompt"
                        />
                    )}
                </Box>

                <Dots
                    className={styles.bottomAreaItem}
                    counter={0}
                    total={3}
                />

                <Box className={classNames(styles.bottomAreaItem, styles.buttonRow)}>
                    <button
                        className={styles.connectionButton}
                        onClick={onRefresh}
                    >
                        <FormattedMessage
                            defaultMessage="Refresh"
                            description="Button in prompt for starting a search"
                            id="gui.connection.search"
                        />
                        <img
                            className={styles.buttonIconRight}
                            src={refreshIcon}
                        />
                    </button>

                    {showUpdate && (
                        <button
                            className={styles.connectionButton}
                            onClick={onUpdatePeripheral}
                        >
                            <FormattedMessage
                                defaultMessage="Update my Device"
                                description="Button to enter the peripheral update mode"
                                id="gui.connection.scanning.updatePeripheralButton"
                            />
                            <img
                                className={styles.buttonIconRight}
                                src={enterUpdateIcon}
                            />
                        </button>
                    )}
                </Box>
            </Box>
        </Box>
    );
};

ScanningStep.propTypes = {
    connectedDevices: PropTypes.arrayOf(PropTypes.string),
    connectingDevices: PropTypes.arrayOf(PropTypes.string),
    connectionSmallIconURL: PropTypes.string,
    multipleDevices: PropTypes.bool,
    onConnecting: PropTypes.func,
    onPeripheralToggle: PropTypes.func,
    onRefresh: PropTypes.func,
    onUpdatePeripheral: PropTypes.func,
    peripheralList: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string,
        peripheralId: PropTypes.string,
        rssi: PropTypes.number
    })),
    scanning: PropTypes.bool.isRequired
};

ScanningStep.defaultProps = {
    connectedDevices: [],
    connectingDevices: [],
    multipleDevices: false,
    peripheralList: [],
    scanning: true
};

export default ScanningStep;
