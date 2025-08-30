import React, { useState } from 'react';
import noimg from '../images/NoImg.png';
import yellowimg from '../images/Yellow.png';
import addIcon from '../icons/add_box_40dp_000000_FILL0_wght200_GRAD0_opsz40.svg';
import editIcon from '../icons/edit_square_40dp_000000_FILL0_wght200_GRAD0_opsz40.svg';
import { toLocalTime } from '../Utils';

const tdKeyStyle = {
  borderBottom: '1px solid #ccc',
  borderLeft: '1px solid #ccc',
  padding: '1px 5px 1px 5px',
  fontWeight: 'bold',
  width: '40%',
  whiteSpace: 'nowrap',
};

const tdValueStyle = {
  borderLeft: '1px solid #ccc',
  borderBottom: '1px solid #ccc',
  padding: '1px 5px 1px 5px',
};

const inputStyle = {
  backgroundColor: 'white',
  color: '#014F91',
  border: '1px solid #014F91',
  padding: '4px',
  borderRadius: '4px',
  width: '95%',
};

const selectStyle = {
  ...inputStyle,
};

const buttonStyle = {
  backgroundColor: '#014F91',
  color: 'white',
  border: '1px solid #014F91',
  borderRadius: '4px',
  padding: '6px 10px',
  cursor: 'pointer',
  width: '48%',
};

const DeviceList = ({ devices, hmacKey, selectedDevice, onSelectDevice, onRefresh }) => {
  const [showFilter, setShowFilter] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [onlyUnconfirmed, setOnlyUnconfirmed] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [addDevice, setAddDevice] = useState(false);
  const [newDevice, setNewDevice] = useState({
    deviceId: '',
    deviceName: '',
    application: 'Continuous',
    direction: 'LowerIsBetter',
    lookback: '',
    scale: 'Days',
    minIssueScore: '',
  });
  const [oldDevice, setOldDevice] = useState({
    deviceId: '',
    deviceName: '',
    application: 'Continuous',
    direction: 'LowerIsBetter',
    lookback: '',
    scale: 'Days',
    minIssueScore: '',
  });

  // Example function to get the border style based on device.heartBeat
  function getBorderStyle(device) {
    //alert('dfafs');
    if (device != null && !device.heartBeat) return '3px dashed #bbb';

    // Convert heartBeat to local time if needed
    const heartBeatTime = toLocalTime(device.heartBeat);
    const now = new Date()

    // Difference in milliseconds
    const diffMs = now - heartBeatTime;
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours <= 1) {
      return '1px solid #ccc';
    } else {
      return '3px dashed #bbb';
    }
  }

  const filteredDevices = devices.filter(device => {
    const matchesName = device.name?.toLowerCase().includes(nameFilter.toLowerCase());
    const matchesIssue = !onlyUnconfirmed || device.hasUnconfirmedIssue;
    return matchesName && matchesIssue;
  });

  const hasFilter = nameFilter || onlyUnconfirmed;

  const clearFilters = () => {
    setNameFilter('');
    setOnlyUnconfirmed(false);
    setShowFilter(false);
  };

  const handleAddDevice = async () => {
    const {
      deviceId, deviceName, application,
      direction, lookback, scale, minIssueScore
    } = newDevice;

    if (!deviceId || !lookback || !minIssueScore || deviceId <= 0 || lookback <= 0 || minIssueScore <= 0) {
      alert("Please fill all numeric fields with positive numbers.");
      return;
    }

    const url = `https://precog.vidasoftapi.com/api/Devices/CreateDevice?` +
      `DeviceId=${deviceId}&DeviceName=${encodeURIComponent(deviceName)}&` +
      `Application=${application}&Direction=${direction}&Lookback=${lookback}&` +
      `Scale=${scale}&MinIssueScore=${minIssueScore}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'accept': '*/*',
          'HMAC_Key': hmacKey
        },
        body: ''
      });

      if (response.ok) {
        alert('Device added successfully');
        setShowAddDevice(false);
        await onRefresh();
      } else {
        const errorText = await response.text();
        alert(`Error adding device: ${response.status} - ${errorText}`);
      }
    } catch (err) {
      alert(`Network error: ${err.message}`);
    }
  };

  const handleUpdateDevice = async () => {
    const {
      deviceId, deviceName, application,
      direction, lookback, scale, minIssueScore
    } = newDevice;

    if (!deviceId || !lookback || !minIssueScore || deviceId <= 0 || lookback <= 0 || minIssueScore <= 0) {
      alert("Please fill all numeric fields with positive numbers.");
      return;
    }

    if (oldDevice.lookback !== lookback || oldDevice.scale !== scale) {
      const proceed = window.confirm(
        "Changing the Lookback or Scale will trigger a full device data reanalysis. Do you want to continue?"
      );
      if (!proceed) return;
    }

    const url = `https://precog.vidasoftapi.com/api/Devices/UpdateDevice?` +
      `DeviceId=${deviceId}&DeviceName=${encodeURIComponent(deviceName)}&` +
      `Application=${application}&Direction=${direction}&Lookback=${lookback}&` +
      `Scale=${scale}&MinIssueScore=${minIssueScore}`;

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'accept': '*/*',
          'HMAC_Key': hmacKey
        },
        body: ''
      });

      if (response.ok) {
        alert('Device updated successfully');
        setShowAddDevice(false);
        await onRefresh();
      } else {
        const errorText = await response.text();
        alert(`Error updating device: ${response.status} - ${errorText}`);
      }
    } catch (err) {
      alert(`Network error: ${err.message}`);
    }
  };

  const handleDeleteDevice = async (deviceId) => {
    // Confirm deletion with user
    const confirmDelete = window.confirm(
      `Are you sure you want to delete device ${deviceId}? This action cannot be undone and will remove all associated data.`
    );

    if (!confirmDelete) return;

    const url = `https://precog.vidasoftapi.com/api/Devices/DeleteDevice?DeviceId=${deviceId}`;

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'accept': '*/*',
          'HMAC_Key': hmacKey
        }
      });

      if (response.ok) {
        alert('Device deleted successfully');
        // Clear selection if the deleted device was selected
        if (selectedDevice && selectedDevice.deviceId === deviceId) {
          onSelectDevice(null);
        }
        setShowAddDevice(false);
        await onRefresh();
      } else {
        const errorText = await response.text();
        alert(`Error deleting device: ${response.status} - ${errorText}`);
      }
    } catch (err) {
      alert(`Network error: ${err.message}`);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '80vh',
        overflow: 'hidden',
        borderRight: '1px solid #ccc',
        flexDirection: 'column',
        minWidth: '300px',
        padding: '0px',
        margin: '0px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: '0px 10px 0px 0px' }}>Devices</h3>
        <span
          onClick={() => setShowFilter(!showFilter)}
          style={{ cursor: 'pointer', fontSize: '20px', marginRight: '10px' }}
        >
          🔍
        </span>
        {hasFilter && <span style={{ color: '#014F91' }}>Filtered</span>}
      </div>

      {showFilter && (
        <div
          style={{
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '10px',
            marginBottom: '10px',
            marginRight: '20px',
            backgroundColor: '#f0f0f0',
          }}
        >
          <div style={{ marginBottom: '8px' }}>
            <label>
              Name contains:
              <input
                type="text"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                style={inputStyle}
              />
            </label>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <label>
              <input
                type="checkbox"
                checked={onlyUnconfirmed}
                onChange={() => setOnlyUnconfirmed(!onlyUnconfirmed)}
                style={{
                  width: '15px',
                  height: '15px',
                  backgroundColor: 'white',
                  accentColor: '#014F91',
                  cursor: 'pointer',
                }}
              />
              &nbsp;Only with unconfirmed issue
            </label>
          </div>
          <button onClick={clearFilters} style={{ padding: '2px 6px', cursor: 'pointer' }}>
            Close / Clear
          </button>
        </div>
      )}

      <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: '0px', paddingRight: '20px', flex: 1 }}>
        {filteredDevices.map((device) => (
          <div
            key={device.deviceId}
            onClick={() => onSelectDevice(device)}
            style={{
              display: 'flex',
              width: '100%',
              padding: '6px',
              marginBottom: '10px',
              backgroundColor:
                selectedDevice?.deviceId === device.deviceId ? '#DADBDF' : '#f9f9f9',
              color: '#11131A',
              border: getBorderStyle(device),
              borderRadius: '4px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              verticalAlign: 'middle',
              justifyContent: 'space-between',
              fontWeight: 500
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'normal',
            }}>
              <img
                src={device.hasUnconfirmedIssue ? yellowimg : noimg}
                alt="Status Icon"
                style={{
                  width: '20px',
                  height: '20px',
                  marginRight: '8px',
                  borderRadius: '3px',
                  flexShrink: 0,
                }}
              />
              <span>
                {device.name ? device.name : `Device Id: ${device.deviceId}`}
              </span>
            </div>

            <button
              onClick={() => {
                setNewDevice({
                  deviceId: device.deviceId || '',
                  deviceName: device.name || '',
                  application: device.application || 'Continuous',
                  direction: device.direction || 'LowerIsBetter',
                  lookback: device.lookback || '',
                  scale: device.scale || 'Days',
                  minIssueScore: device.minIssueScore || ''
                });
                setOldDevice({
                  deviceId: device.deviceId || '',
                  deviceName: device.name || '',
                  application: device.application || 'Continuous',
                  direction: device.direction || 'LowerIsBetter',
                  lookback: device.lookback || '',
                  scale: device.scale || 'Days',
                  minIssueScore: device.minIssueScore || ''
                });
                setAddDevice(false);
                setShowAddDevice(true);
              }}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                margin: '0px 5px 0px 10px',
                padding: '0px',
                verticalAlign: 'middle',
                alignItems: 'right'
              }}
            >
              <img
                src={editIcon}
                alt="Add device"
                style={{
                  width: '25px',
                }}
              />
            </button>

          </div>
        ))}
      </div>

      <button
        onClick={() => {
          setNewDevice({
            deviceId: '',
            deviceName: '',
            application: 'Continuous',
            direction: 'LowerIsBetter',
            lookback: '',
            scale: 'Days',
            minIssueScore: ''
          });
          setAddDevice(true);
          setShowAddDevice(true);
        }}
        style={{
          backgroundColor: 'white',
          border: 'none',
          cursor: 'pointer',
          margin: 'auto',
          padding: '0px'
        }}
      >
        <img
          src={addIcon}
          alt="Add device"
          style={{
            width: '35px',
          }}
        />
      </button>

      <div
        style={{
          padding: '0px',
          borderTop: '1px solid #ccc',
          maxHeight: '50%',
          overflowY: 'auto',
        }}
      >
        {selectedDevice ? (
          <>
            <h4 style={{ margin: 0, paddingTop: 1, paddingBottom: 1, backgroundColor: '#0077CB', color: '#ffffff' }}>Device Details</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={tdKeyStyle}>Device Id</td>
                  <td style={tdValueStyle}>{selectedDevice.deviceId}</td>
                </tr>
                <tr>
                  <td style={tdKeyStyle}>Application</td>
                  <td style={tdValueStyle}>{selectedDevice.application}</td>
                </tr>
                <tr>
                  <td style={tdKeyStyle}>Direction</td>
                  <td style={tdValueStyle}>{selectedDevice.direction}</td>
                </tr>
                <tr>
                  <td style={tdKeyStyle}>Lookback, Scale</td>
                  <td style={tdValueStyle}>
                    {selectedDevice.lookback} {selectedDevice.scale}
                  </td>
                </tr>
                <tr>
                  <td style={tdKeyStyle}>Min Issue Score</td>
                  <td style={tdValueStyle}>{selectedDevice.minIssueScore}</td>
                </tr>
                <tr>
                  <td style={tdKeyStyle}>HeartBeat</td>
                  <td style={tdValueStyle}>{toLocalTime(selectedDevice.heartBeat).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>


          </>
        ) : null}

        {showAddDevice && (
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              padding: '20px',
              border: '1px solid #ccc',
              borderRadius: '8px',
              zIndex: 1000,
              width: '300px',
            }}
          >
            <h3 style={{ color: '#014F91' }}>{addDevice ? "Add New Device" : "Edit Device"}</h3>
            <div style={{ marginBottom: '8px' }}>
              <label>Device ID:
                <input type="number" min="1" value={newDevice.deviceId}
                  onChange={e => setNewDevice({ ...newDevice, deviceId: e.target.value })}
                  style={inputStyle}
                  disabled={addDevice ? false : true}
                />
              </label>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <label>Device Name:
                <input type="text" maxLength="440" value={newDevice.deviceName}
                  onChange={e => setNewDevice({ ...newDevice, deviceName: e.target.value })}
                  style={inputStyle}
                />
              </label>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <label>Application{addDevice ? '' : ' [if no data]'}:
                <select value={newDevice.application}
                  onChange={e => setNewDevice({ ...newDevice, application: e.target.value })}
                  style={selectStyle}
                >
                  <option>Continuous</option>
                  <option>Periodic</option>
                </select>
              </label>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <label>Direction{addDevice ? '' : ' [if no data]'}:
                <select value={newDevice.direction}
                  onChange={e => setNewDevice({ ...newDevice, direction: e.target.value })}
                  style={selectStyle}
                >
                  <option>LowerIsBetter</option>
                  <option>HigherIsBetter</option>
                  <option>BiDirectional</option>
                </select>
              </label>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <label>Lookback{addDevice ? '' : ' [cause update]'}:
                <input type="number" min="1" max="10000" value={newDevice.lookback}
                  onChange={e => setNewDevice({ ...newDevice, lookback: e.target.value })}
                  style={inputStyle}
                />
              </label>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <label>Scale{addDevice ? '' : ' [cause update]'}:
                <select value={newDevice.scale}
                  onChange={e => setNewDevice({ ...newDevice, scale: e.target.value })}
                  style={selectStyle}
                >
                  <option>Days</option>
                  <option>Hours</option>
                  <option>Microseconds</option>
                  <option>Milliseconds</option>
                  <option>Minutes</option>
                  <option>Months</option>
                  <option>Periods</option>
                  <option>Seconds</option>
                  <option>Ticks</option>
                  <option>Years</option>
                </select>
              </label>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <label>Min Issue Score:
                <input type="number" min="1" value={newDevice.minIssueScore}
                  onChange={e => setNewDevice({ ...newDevice, minIssueScore: e.target.value })}
                  style={inputStyle}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '0px', width: '100%' }}>
              <button style={buttonStyle} onClick={() => setShowAddDevice(false)}>Cancel</button>
              <button style={buttonStyle} onClick={addDevice ? handleAddDevice : handleUpdateDevice}>{addDevice ? "Add" : "Update"}</button>
            </div>

            <div style={{
              display: addDevice ? 'none' : 'flex',
              justifyContent: 'space-between',
              marginTop: '30px',
              width: '100%',
            }}>
              <button
                onClick={() => handleDeleteDevice(selectedDevice.deviceId)}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#C23B22',
                  borderColor: '#dc3545'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceList;