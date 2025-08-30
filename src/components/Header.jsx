import React, { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import precogLogo2 from '../images/PG.png';
import refreshLogo from '../images/RefreshBtn.png';
import signal1Data from '../demo/signal1.json';
import signal2Data from '../demo/signal2.json';
import curve1Data from '../demo/curve1.json';
import { toLocalTime } from '../Utils';
import '../App.css'; // Added import

const Header = ({ hmacKey, onRefresh, startDate, endDate, setStartDate, setEndDate, readNotification, setReadNotification }) => {
  const { setCredentials, credentials } = useContext(AuthContext);
  const [clickCount, setClickCount] = useState(0);
  const [showSecretButtons, setShowSecretButtons] = useState(false);
  const [activeButton, setActiveButton] = useState(null);

  const handleLogout = () => {
    setCredentials({ userName: '', password: '' });
    window.location.reload(); // Force reset to login
  };

  async function callTest(testMethod) {
    switch (testMethod) {
      case 'R':
        const confirmReset = window.confirm(
          `Are you sure you want to reset demo data?`
        );

        if (!confirmReset) {
          setActiveButton(null);
          return;
        }

        try {
          const response = await fetch('https://precog.vidasoftapi.com/api/Test/ResetTestData', {
            method: 'POST',
            headers: {
              'accept': '*/*',
              'HMAC_Key': hmacKey
            },
            body: ''
          });

          if (response.ok) {
            await onRefresh();
          } else {
            const errorText = await response.text();
            alert(`${response.status} - ${errorText}`);
          }
        } catch (err) {
          alert("Error while running Reset: " + err.message);
        }
        break;

      case 1:
      case 2:
      case 3:
        try {
          // Send the main test data
          const response = await fetch(
            'https://precog.vidasoftapi.com/api/' + (testMethod === 3 ? 'Periodic/Curves?DeviceId=2' : 'Continuous/Signals?DeviceId=1')
            , {
              method: 'POST',
              headers: {
                'accept': '*/*',
                'HMAC_Key': hmacKey,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(
                testMethod === 1 ? signal1Data : (testMethod === 2 ? signal2Data : curve1Data)
              )
            });

          if (response.ok) {
            // Then call NoteHeartBeat
            await fetch(
              'https://precog.vidasoftapi.com/api/Devices/NoteHeartBeat?DeviceId=' + (testMethod === 3 ? '2' : '1'),
              {
                method: 'POST',
                headers: {
                  'accept': '*/*',
                  'HMAC_Key': hmacKey
                },
                body: ''
              }
            );
            await onRefresh();
          } else {
            const err = await response.text();
            alert(`Case ${testMethod} failed: ${response.status} - ${err}`);
          }
        } catch (err) {
          alert(`Error while running Case ${testMethod}: ` + err.message);
        }
        break;
    }
    setActiveButton(null);
  }

  return (
    <header className="header-bar">
      <div className="header-content">
        <h2 className="header-title">
          <img
            src={precogLogo2}
            alt="PRECOG Logo"
            className="logo-img"
          />
          PRECOG {showSecretButtons ? '' : 'DASHBOARD'}

          {showSecretButtons && (
            <div className="secret-btns">
              {['R', 1, 2, 3].map((num) => (
                <button
                  key={num}
                  onClick={async () => {
                    if (activeButton === null) {
                      setActiveButton(num);
                      await callTest(num);
                    }
                  }}
                  className={`secret-btn${activeButton === num ? ' active' : ''}`}
                >
                  {num}
                </button>
              ))}
            </div>
          )}

        </h2>

        <div className="header-controls">
          <div>
            <label className="date-label">Start</label>
            <input
              type="datetime-local"
              step="1"
              value={toLocalTime(startDate).toISOString().slice(0, 19)}
              onChange={(e) => setStartDate(new Date(e.target.value))}
              className="date-input"
            />
          </div>
          <div>
            <button
              onClick={() => {
                const newCount = clickCount + 1;
                setClickCount(newCount);
                if (newCount === 10) {
                  const password = prompt("Enter password:");
                  if (password === "vsstest") {
                    setShowSecretButtons(true);
                  } else {
                    alert("Wrong password.");
                  }
                  setClickCount(0); // Reset after password attempt
                }
              }}
              className="end-btn"
            >
              End
            </button>

            <input
              type="datetime-local"
              step="1"
              value={toLocalTime(endDate).toISOString().slice(0, 19)}
              onChange={(e) => setEndDate(new Date(e.target.value))}
              className="date-input"
            />
          </div>

          <button
            onClick={() => setReadNotification((prev => !prev))}
            className={`audio-btn${readNotification ? '' : ' disabled'}`}
            aria-label="Read message aloud"
            title={readNotification ? 'Read notifications aloud' : 'Do not read notifications aloud'}
          >
            {readNotification ? '🔊' : '🔇'}
          </button>

          <button
            onClick={onRefresh}
            className="refresh-btn"
          >
            <img
              src={refreshLogo}
              alt="Refresh Logo"
              className="refresh-img"
            />
          </button>
          {credentials?.userName && (
            <span className="username">{credentials.userName}</span>
          )}
          <button
            onClick={handleLogout}
            className="logout-btn"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
