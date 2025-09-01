// App.jsx
import React, { useContext, useEffect, useState, useRef } from 'react';
import './App.css';
import { AuthContext, AuthProvider } from './context/AuthContext';
import Login from './components/Login';
import Header from './components/Header';
import DeviceList from './components/DeviceList';
import IssueList from './components/IssueList';
import Notifier from 'react-desktop-notification';
import alertimg from './images/Alert.png';
import precogLogo from './images/PRECOG_Logo.png';
import vssLogo from './images/Vida_Soft.svg';
import favLogo from './images/PG.png';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { toLocalTime } from './Utils';

const shownIssueNotifications = new Set();
const shownDeviceNotifications = new Set();

function formatDate(dateString) {
  const date = new Date(dateString);
  if (isNaN(date)) return dateString;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');

  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

function formatDateRange(dateString1, dateString2) {
  const date1 = new Date(dateString1);
  const date2 = new Date(dateString2);

  if (!dateString1 && dateString2) return formatDate(date2);
  if (!dateString1 && !dateString2) return '';

  const sameDay =
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate();

  if (sameDay) {
    return `${formatDate(dateString1)} - ${formatDate(dateString2).split(' ')[1]}`;
  } else {
    return `${formatDate(dateString1)} - ${formatDate(dateString2)}`;
  }
}

function AppContent() {
  const { hmacKey, isAuthenticating } = useContext(AuthContext);
  const [devices, setDevices] = useState([]);
  const [issues, setIssues] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [initializedFromUrl, setInitializedFromUrl] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [firstUse, setFirstUse] = useState(true);
  const lastIssuesUpdatedAtRef = useRef(null);
  const [readNotification, setReadNotification] = useState(false);
  const readNotificationRef = useRef(false);
  const [userDisplayName, setUserDisplayName] = useState(isAuthenticating.userName);

  useEffect(() => {
    //document.title = "PRECOG Dashboard";
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    //link.href = favLogo;
  }, []);


  const readAloud = (text) => {
    if (!text || !readNotificationRef.current) return;
    window.speechSynthesis.cancel();

    const sentences = text.match(/[^.!?]+[.!?]+[\])'"`’”]*|.+/g); // naive sentence splitter

    let i = 0;

    const speakNext = () => {
      if (i < sentences.length) {
        const utterance = new SpeechSynthesisUtterance(sentences[i]);
        utterance.lang = 'en-US';
        utterance.onend = () => speakNext(); // speak next when finished
        if (readNotificationRef.current) window.speechSynthesis.speak(utterance);
        i++;
      }
    };

    speakNext();
  };


  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 500);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 365);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const fetchDevices = async () => {
    try {
      const response = await fetch(
        'https://precog.vidasoftapi.com/api/Devices/GetDeviceDetails',
        {
          headers: {
            accept: '*/*',
            HMAC_Key: hmacKey,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setDevices(data);

        // Send notifications for devices with unconfirmed issues
        data.forEach((device) => {
          if (
            device.deviceId !== null &&
            device.hasUnconfirmedIssue &&
            device.deviceId !== selectedDevice.deviceId &&
            !shownDeviceNotifications.has(device.deviceId)
          ) {
            Notifier.start(
              device.name === "" ? ("device id: " + device.deviceId) : device.name,
              'Unconfirmed issue detected.',
              `${window.location.origin}?deviceId=${device.deviceId}`,
              alertimg,
              5000
            );
            toast.warn(
              <div>
                <strong>{device.name === "" ? "device id: " + device.deviceId : device.name}</strong>
                <br />
                <div>'Unconfirmed issue detected.'</div>
              </div>,
              {
                position: 'top-center',
                icon: true,
                closeButton: true,
                autoClose: 5000,
              });
            shownDeviceNotifications.add(device.deviceId);
          }
        });

        // Remove notifications for devices that no longer have unconfirmed issues
        shownDeviceNotifications.forEach((deviceId) => {
          const device = data.find((d) => d.deviceId === deviceId);
          if (!device || !device.hasUnconfirmedIssue) {
            shownDeviceNotifications.delete(deviceId);
          }
        });

        return data;
      } else {
        console.error('Failed to fetch devices:', response.status);
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
    }
    return [];
  };

  const fetchIssuesApp = async (device) => {
    try {
      const start = encodeURIComponent(toLocalTime(startDate).toISOString().substring(0, 19));
      const end = encodeURIComponent(toLocalTime(endDate).toISOString().substring(0, 19));
      const url = `https://precog.vidasoftapi.com/api/Issues/GetIssuesByMeasuredDateRange?DeviceId=${device.deviceId}&StartDate=${start}&EndDate=${end}`;

      const response = await fetch(url, {
        headers: {
          accept: '*/*',
          HMAC_Key: hmacKey,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setIssues(data || []);

        // Check for unconfirmed issues and notify
        const params = new URLSearchParams(window.location.search);
        const deviceIdUrl = params.get('deviceId');
        const issueIdUrl = params.get('issueId');
        const keyUrl = `${deviceIdUrl}_${issueIdUrl}`;

        if (device && data?.length) {
          data.forEach((issue) => {
            const key = `${device.deviceId}_${issue.issueId}`;
            if (!issue.confirmed &&
              issue.isAnomaly &&
              keyUrl != key &&
              !shownIssueNotifications.has(key) &&
              issue.message != null &&
              device.hasUnconfirmedIssue) {
              readAloud(issue.message);
              Notifier.start(
                device.name === "" ? ("device id: " + device.deviceId) : device.name,
                `${formatDateRange(issue.measuredAtFrom, issue.measuredAtTo)}\n${issue.message}`,
                `${window.location.origin}?deviceId=${device.deviceId}&issueId=${issue.issueId}`,
                alertimg,
                30000
              );
              toast.warn(
                <div>
                  <strong>{device.name === "" ? "device id: " + device.deviceId : device.name}</strong>
                  <div style={{ fontSize: '14px', color: 'gray' }}>{formatDateRange(issue.measuredAtFrom, issue.measuredAtTo)}</div>
                  <br />
                  <div>{issue.message}</div>
                </div>,
                {
                  position: 'top-center',
                  icon: true,
                  closeButton: true,
                  autoClose: 30000,
                }
              );

              shownIssueNotifications.add(key);
            }
          });
        }
      } else {
        console.error('Failed to fetch issues:', response.status);
      }
    } catch (error) {
      console.error('Error fetching issues:', error);
    }
  };

  const requestUserDisplayName = async () => {
    try {

      const response = await fetch(
        'https://precog.vidasoftapi.com/api/User/GetUserDetails',
        {
          headers: {
            accept: '*/*',
            HMAC_Key: hmacKey,
          }
        }
      );

      if (response.ok) {
        const data = await response.json();  // parse the response
        return data.displayName; // fallback if displayName missing
      } else {
        return null;
      }
    } catch (err) {
      return null;
    }
  };


  const handleRefresh = async () => {
    const latestDevices = await fetchDevices(); // ✅ Await the result

    const latestSelected = latestDevices.find((d) => d.deviceId === selectedDevice?.deviceId);

    if (latestSelected) {
      fetchIssuesApp(latestSelected);
      lastIssuesUpdatedAtRef.current = latestSelected.issuesUpdatedAt;
    }
  };


  // Periodic fetching
  useEffect(() => {
    if (!hmacKey) return;

    handleRefresh();

    requestUserDisplayName().then((name) => setUserDisplayName(name));

    const interval = setInterval(async () => {
      const latestDevices = await fetchDevices(); // ✅ Await the result

      const latestSelected = latestDevices.find((d) => d.deviceId === selectedDevice?.deviceId);

      if (latestSelected) {
        const latestUpdatedAt = latestSelected.issuesUpdatedAt;
        if (!latestUpdatedAt || !lastIssuesUpdatedAtRef.current || latestUpdatedAt !== lastIssuesUpdatedAtRef.current) {
          fetchIssuesApp(latestSelected);
          lastIssuesUpdatedAtRef.current = latestUpdatedAt;
        }
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [hmacKey, selectedDevice, startDate, endDate]);

  useEffect(() => {
    const savedSetting = localStorage.getItem('readNotification');
    if (savedSetting === 'true') {
      setReadNotification(true);
      readNotificationRef.current = true;
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('readNotification', readNotification.toString());
    readNotificationRef.current = readNotification;
  }, [readNotification]);

  useEffect(() => {
    if (selectedDevice) {
      fetchIssuesApp(selectedDevice);
      lastIssuesUpdatedAtRef.current = selectedDevice.issuesUpdatedAt;
    }
  }, [selectedDevice, startDate, endDate]);

  useEffect(() => {
    if (devices.length > 0 && !selectedDevice) {
      setSelectedDevice(devices[0]);
    }
  }, [devices, selectedDevice]);

  useEffect(() => {
    if (initializedFromUrl || !devices.length) return;

    const params = new URLSearchParams(window.location.search);
    const deviceId = params.get('deviceId');
    const issueId = params.get('issueId');

    if (deviceId) {
      const matchedDevice = devices.find((d) => d.deviceId.toString() === deviceId);
      if (matchedDevice) {
        setSelectedDevice(matchedDevice);
      }
    }

    if (deviceId && issueId) {
      setSelectedIssueId(issueId);
    }

    setInitializedFromUrl(true); // prevent re-triggering
  }, [devices, initializedFromUrl]);



  if (!hmacKey) {
    return (
      <main className="login-main">
        <img
          src={precogLogo}
          alt="PRECOG Logo"
          className="login-logo"
        />
        <h2 className="login-title">
          {'Login to\nPREDICTIVE INDUSTRIAL SENTINEL AI'}
        </h2>
        <Login />
        <img
          src={vssLogo}
          alt="Vida Soft Services Logo"
          className="vss-logo"
        />
      </main>
    );
  }

  return (
    <>
      <Header
        hmacKey={hmacKey}
        onRefresh={handleRefresh}
        startDate={startDate}
        endDate={endDate}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
        readNotification={readNotification}
        setReadNotification={setReadNotification}
        displayName={userDisplayName}
      />
      <div className="dashboard-content">
        <div className="device-list-container">
          <DeviceList
            devices={devices}
            hmacKey={hmacKey}
            selectedDevice={selectedDevice}
            onSelectDevice={setSelectedDevice}
            onRefresh={handleRefresh}
          />
        </div>
        <div className="issue-list-container">
          {selectedDevice && (
            <IssueList
              device={selectedDevice}
              hmacKey={hmacKey}
              issues={issues}
              selectedIssueId={firstUse ? selectedIssueId : null}
              firstUse={firstUse}
              setFirstUse={setFirstUse}
              onRefresh={handleRefresh}
            />
          )}
        </div>
      </div>
      <ToastContainer />
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
