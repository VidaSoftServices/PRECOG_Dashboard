// components/IssueList.jsx
import React, { useEffect, useState } from 'react';
import greenimg from '../images/Green.png';
import yellowimg from '../images/Yellow.png';
import redimg from '../images/Red.png';
import okimg from '../images/Issue.png';
import nokimg from '../images/FalsePositive.png';
import noimg from '../images/NoImg.png';
import DataChart from './DataChart';
import { toLocalTime } from '../Utils';

function formatDate(dateString) {
  const date = new Date(dateString);
  if (isNaN(date)) return dateString;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const sec = String(date.getSeconds()).padStart(2, '0');

  return `${yyyy}.${mm}.${dd} ${hh}:${min}:${sec}`;
}

const IssueList = ({ device, hmacKey, issues, selectedIssueId, firstUse, setFirstUse, onRefresh }) => {
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [lastDeviceId, setLastDeviceId] = useState(null);
  const [hasManualSelected, setHasManualSelected] = useState(false);
  const [anomalyDecision, setAnomalyDecision] = useState(null); // "Yes" or "No"
  const [userMessage, setUserMessage] = useState('');
  const [apiResponseMessage, setApiResponseMessage] = useState('');
  const [creatingNewIssue, setCreatingNewIssue] = useState(false);
  const [measuredFrom, setMeasuredFrom] = useState('');
  const [measuredTo, setMeasuredTo] = useState('');
  // New filter state
  const [filterNotConfirmed, setFilterNotConfirmed] = useState(false);
  const [filterAnomaly, setFilterAnomaly] = useState(false);
  const [filterOthers, setFilterOthers] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);

  // Filter logic
  const filteredIssues = issues.filter(issue => {
    // If no filter is active, show all
    if (!filterNotConfirmed && !filterAnomaly && !filterOthers) return true;

    if (filterNotConfirmed && !issue.confirmed && issue.isAnomaly) return true;
    if (filterAnomaly && issue.confirmed && issue.isAnomaly) return true;
    if (
      filterOthers &&
      issue.confirmed &&
      !issue.isAnomaly
    ) return true;

    return false;
  });


  const handleAnomalyResponse = async (isAnomaly) => {
    const isContinuous = device.application === 'Continuous';
    const trimmedMessage = userMessage.trim();
    const messageToSend = trimmedMessage === '' ? "No_Change" : trimmedMessage;
    const measuredAtFromParam = measuredFrom ? `&MeasuredAtFrom=${encodeURIComponent(measuredFrom)}` : '';
    const measuredAtToParam = measuredTo ? `&MeasuredAtTo=${encodeURIComponent(measuredTo)}` : '';

    const url = isContinuous
      ? `https://precog.vidasoftapi.com/api/Issues/UpdateContiniousIssue?DeviceId=${device.deviceId}&IssueId=${selectedIssue.issueId}&IsAnomaly=${isAnomaly}`
      : `https://precog.vidasoftapi.com/api/Issues/UpdatePeriodicIssue?DeviceId=${device.deviceId}&IssueId=${selectedIssue.issueId}&IsAnomaly=${isAnomaly}${measuredAtFromParam}${measuredAtToParam}`;

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'accept': '*/*',
          'HMAC_Key': hmacKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageToSend),
      });

      const responseText = await response.text();
      setApiResponseMessage(`${responseText}`);

      if (response.ok) {
        setSelectedIssue((prevIssue) => ({
          ...prevIssue,
          isAnomaly: isAnomaly,
          message: messageToSend !== "No_Change" ? messageToSend : prevIssue.message,
        }));
      }

      if (onRefresh) {
        onRefresh();
      }

      // Hide the message after 3 seconds
      setApiResponseMessage('');
    } catch (error) {
      setApiResponseMessage('Error sending data.');
      setTimeout(() => setApiResponseMessage(''), 3000);
    }
  };

  const handleCreatePeriodicIssue = async (isAnomaly) => {
    const trimmedMessage = userMessage.trim();
    const messageToSend = trimmedMessage === '' ? "Enter_Issue_Description" : trimmedMessage;

    const url = `https://precog.vidasoftapi.com/api/Issues/CreatePeriodicIssue?DeviceId=${device.deviceId}&CurvePeriod=${selectedIssue.issueId}&IsAnomaly=${isAnomaly}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'accept': '*/*',
          'HMAC_Key': hmacKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageToSend),
      });

      const responseText = await response.text();
      setApiResponseMessage(responseText);

      if (response.ok) {
        if (onRefresh) {
          await onRefresh(); // Wait for data refresh
        }
      }

      setApiResponseMessage('');
    } catch (error) {
      setApiResponseMessage('Error sending data.');
      setTimeout(() => setApiResponseMessage(''), 3000);
    }
  };


  const handleDeleteIssue = async () => {
    if (!selectedIssue) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to ${device.application === 'Continuous' ? 'remove' : 'delete'} Issue #${selectedIssue.issueId}?`
    );
    if (!confirmDelete) return;

    const isContinuous = device.application === 'Continuous';
    const issueId = selectedIssue.issueId;
    const deviceId = device.deviceId;

    const url = isContinuous
      ? `https://precog.vidasoftapi.com/api/Issues/DeleteContiniousIssue?DeviceId=${deviceId}&IssueId=${issueId}`
      : `https://precog.vidasoftapi.com/api/Issues/DeletePeriodicIssue?DeviceId=${deviceId}&IssueId=${issueId}`;

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'accept': '*/*',
          'HMAC_Key': hmacKey,
        },
      });

      const responseText = await response.text();
      setApiResponseMessage(responseText);

      if (response.ok && onRefresh) {
        await onRefresh(); // Refresh the list
        setSelectedIssue(null); // Reset selection
      }

      setCreatingNewIssue(false);
      setAnomalyDecision(null);
      setUserMessage('');
      setApiResponseMessage('');
    } catch (error) {
      setApiResponseMessage('Error deleting issue.');
      setTimeout(() => setApiResponseMessage(''), 3000);
    }
  };

  const readAloud = (text) => {
    if (!text) return;
    window.speechSynthesis.cancel();

    const sentences = text.match(/[^.!?]+[.!?]+[\])'"`’”]*|.+/g); // naive sentence splitter

    let i = 0;

    const speakNext = () => {
      if (i < sentences.length) {
        const utterance = new SpeechSynthesisUtterance(sentences[i]);
        utterance.lang = 'en-US';
        utterance.onend = () => speakNext(); // speak next when finished
        window.speechSynthesis.speak(utterance);
        i++;
      }
    };

    speakNext();
  };

  const selectedIndex = issues.findIndex(issue => issue.issueId === selectedIssue?.issueId);
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'ArrowUp' && selectedIndex > 0) || (e.key === 'ArrowDown' && selectedIndex < issues.length - 1)) {
        let filteredIssueIndex = filteredIssues.findIndex(issue => issue.issueId === selectedIssue?.issueId);

        if (filteredIssueIndex === -1 && selectedIssue?.issueId != null) {
          // Fallback: find the numerically closest issueId
          let closestIndex = -1;
          let minDiff = Infinity;

          filteredIssues.forEach((issue, index) => {
            const diff = Math.abs(issue.issueId - selectedIssue.issueId);
            if (diff < minDiff) {
              minDiff = diff;
              closestIndex = index;
            }
          });

          filteredIssueIndex = closestIndex;
        }


        if (e.key === 'ArrowUp' && filteredIssueIndex > 0) {


          setSelectedIssue(filteredIssues[filteredIssueIndex - 1]);
        } else if (e.key === 'ArrowDown' && filteredIssueIndex < filteredIssues.length - 1) {

          setSelectedIssue(filteredIssues[filteredIssueIndex + 1]);
        }
      };
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, issues]);


  useEffect(() => {
    if (device.deviceId !== lastDeviceId) {
      setHasManualSelected(true);
      setLastDeviceId(device.deviceId);
    }
  }, [device, lastDeviceId]);

  useEffect(() => {
    if (!issues || issues.length === 0) {
      setSelectedIssue(null);
      return;
    }

    if (selectedIssueId) {
      const matched = issues.find((i) => i.issueId.toString() === selectedIssueId);
      if (matched) {
        setSelectedIssue(matched);
        setFirstUse(false);
        return;
      }
    }

    // If previously selected issue exists but we need updated data
    if (selectedIssue) {
      const updated = issues.find((i) => i.issueId === selectedIssue.issueId);
      if (updated) {
        setSelectedIssue(updated);
        return;
      }
    }

    // Default selection fallback
    if (firstUse || hasManualSelected) {
      setSelectedIssue(issues[0]);
      setFirstUse(false);
    }

    setHasManualSelected(false);
  }, [issues, selectedIssueId]);


  useEffect(() => {
    // Reset form state when switching issues
    if (selectedIssue?.confirmed) {
      setAnomalyDecision(selectedIssue.isAnomaly ? 'No' : 'Yes');
    } else {
      setAnomalyDecision(null);
    }
    setMeasuredFrom(selectedIssue?.measuredAtFrom || '');
    setMeasuredTo(selectedIssue?.measuredAtTo || '');
    setUserMessage('');
    setApiResponseMessage('');
  }, [selectedIssue]);


  if (!issues || issues.length === 0) {
    return <p>No issues found for this device.</p>;
  }

  return (
    <div style={{ display: 'flex', height: '80vh', overflow: 'hidden' }}>
      {/* Left side: Issue list */}
      <div
        style={{
          flex: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '0px 15px 10px 10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', gap: '12px' }}>
          <h3 style={{ margin: '0px' }}>Issues</h3>

          {/* Toggle buttons with icons */}
          <button
            onClick={() => setFilterNotConfirmed(!filterNotConfirmed)}
            style={{
              border: filterNotConfirmed ? '2px solid #014F91' : '1px solid #ccc',
              backgroundColor: filterNotConfirmed ? '#d0e1f9' : '#fff',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              marginLeft: '20px',
            }}
            title="Show Not Confirmed"
          >
            <img
              src={yellowimg}
              alt="Not Confirmed"
              style={{ width: 20, height: 20 }}
            />
          </button>

          <button
            onClick={() => setFilterAnomaly(!filterAnomaly)}
            style={{
              border: filterAnomaly ? '2px solid #014F91' : '1px solid #ccc',
              backgroundColor: filterAnomaly ? '#d0e1f9' : '#fff',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Show Anomalies"
          >
            <img
              src={redimg}
              alt="Anomaly"
              style={{ width: 20, height: 20 }}
            />
          </button>

          <button
            onClick={() => setFilterOthers(!filterOthers)}
            style={{
              border: filterOthers ? '2px solid #014F91' : '1px solid #ccc',
              backgroundColor: filterOthers ? '#d0e1f9' : '#fff',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Show Others (Confirmed & Not Anomaly)"
          >
            <img
              src={greenimg}
              alt="Others"
              style={{ width: 20, height: 20 }}
            />
          </button>

          {/* Show Filtered text if any filter is active */}
          {(filterNotConfirmed || filterAnomaly || filterOthers) && (
            <span style={{ margin: '0px', color: '#555', fontSize: '0.9em' }}>
              Filtered
            </span>
          )}
        </div>

        <div style={{ paddingRight: '15px', marginRight: '0px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', overflowX: 'hidden' }}>
          {filteredIssues.length === 0 ? (
            <p>No issues matching the selected filters.</p>
          ) : (
            filteredIssues.map((issue) => (
              <button
                key={issue.issueId}
                style={{
                  textAlign: 'left',
                  padding: '6px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  backgroundColor: selectedIssue?.issueId === issue.issueId ? '#014F91' : '#f9f9f9',
                  color: selectedIssue?.issueId === issue.issueId ? '#fff' : '#014F91',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title={issue.message}
                onClick={() => setSelectedIssue(issue)}
              >
                <img
                  src={
                    !issue.confirmed
                      ? issue.isAnomaly
                        ? yellowimg
                        : noimg
                      : issue.isAnomaly
                        ? redimg
                        : greenimg
                  }
                  alt="Issue icon"
                  style={{
                    width: '20px',
                    verticalAlign: 'middle',
                    marginRight: '8px',
                    marginBottom: '3px',
                  }}
                />
                {formatDateRange(issue.measuredAtFrom, issue.measuredAtTo)}{' '}
                {device.application !== 'Periodic' ? '' : `[IS: ${issue.issueScore}]`}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right side: Issue details */}
      <div
        style={{
          flex: 1,
          padding: '0px 20px 10px 10px',
          borderLeft: '1px solid #ccc',
          textAlign: 'left',
          overflowY: 'auto',
        }}
      >
        {selectedIssue ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', padding: '0px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', paddingBottom: '0px' }}>
                {selectedIssue.periodFrom !== null ? 'Issue #' : 'Curve Period #'}
                {selectedIssue.issueId}</h3>
              <button
                onClick={() => setDetailsCollapsed(!detailsCollapsed)}
                style={{
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  margin: '0px',
                  height: '30px',
                  color: '#014F91',
                }}
              >
                {detailsCollapsed ? 'Show Details ▲' : 'Hide Details ▼'}
              </button>
            </div>



            <div style={{ margin: 0 }}>
              <div style={{ display: selectedIssue.periodFrom !== null ? 'block' : 'none' }}>
                <strong>Issue:</strong> {selectedIssue.isAnomaly ? 'Yes' : 'No'}
                <br />
                <strong>Confirmed:</strong> {selectedIssue.confirmed ? 'Yes' : 'No'}
              </div>

              <div style={{ display: device.application === 'Continuous' ? 'none' : 'block' }}>
                <strong>Issue score:</strong> {selectedIssue.issueScore}
              </div>
            </div>


            {selectedIssue.periodFrom !== null && (
              <table style={{ margin: '10px 0px 10px 0px', padding: 0, borderSpacing: 0 }}>
                <tbody>
                  <tr>
                    <td style={{ paddingRight: '10px' }}><strong>From:</strong></td>
                    <td>{formatDate(selectedIssue.measuredAtFrom)}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: '10px' }}><strong>To:</strong></td>
                    <td>{formatDate(selectedIssue.measuredAtTo)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <p style={{ display: selectedIssue.periodFrom !== null ? 'none' : 'block' }}><strong>Date:</strong> {formatDate(selectedIssue.measuredAtTo)}</p>


            <div style={{ display: selectedIssue.periodFrom !== null ? 'block' : 'none' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
              }}>
                <strong>Message:</strong>
                <button
                  onClick={() => readAloud(selectedIssue.message)}
                  disabled={!selectedIssue.message}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: selectedIssue.message ? 'pointer' : 'not-allowed',
                    padding: '0',
                    fontSize: '1.2em',
                    color: '#014F91',
                  }}
                  aria-label="Read message aloud"
                  title={selectedIssue.message ? 'Read message aloud' : 'No message to read'}
                >
                  🔊
                </button>
              </div>

              <ul style={{ paddingLeft: '0px', margin: '0px' }}>
                {selectedIssue.message === null
                  ? 'No message'
                  : selectedIssue.message
                    .split(/(?<=[\.\?!;:])\s+/)
                    .filter(Boolean)
                    .map((sentence, index) => (
                      <p
                        key={index}
                        style={{
                          margin: '0px',
                          marginTop: '5px',
                          padding: '0px',
                        }}
                      >
                        {sentence.trim()}
                      </p>
                    ))}
              </ul>
            </div>

            {!detailsCollapsed && (
              <>

                {
                  <div style={{ marginTop: '20px', borderTop: '1px solid #ccc', paddingTop: '20px' }}>
                    {
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => setAnomalyDecision('Yes')}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: anomalyDecision === 'Yes' ? '#014F91' : '#fff',
                            color: anomalyDecision === 'Yes' ? '#fff' : '#014F91',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '20px',
                            fontStyle: 'bold',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <img
                            src={okimg}
                            alt="Issue icon"
                            style={{
                              width: '45px',
                              verticalAlign: 'middle',
                              marginRight: '8px',
                              marginBottom: '3px',
                            }}
                          />
                          Yes
                        </button>

                        <button
                          onClick={() => setAnomalyDecision('No')}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: anomalyDecision === 'No' ? '#014F91' : '#fff',
                            color: anomalyDecision === 'No' ? '#fff' : '#014F91',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '20px',
                            fontStyle: 'bold',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <img
                            src={nokimg}
                            alt="Issue icon"
                            style={{
                              width: '45px',
                              verticalAlign: 'middle',
                              marginRight: '8px',
                              marginBottom: '3px',
                            }}
                          />
                          No
                        </button>

                        {anomalyDecision
                          && device.application !== 'Continuous'
                          && selectedIssue.periodFrom !== null && (
                            <table style={{ margin: '0px', paddingLeft: '10px' }}>
                              <tbody>
                                <tr>
                                  <td>From:</td>
                                  <td>
                                    <input
                                      type="datetime-local"
                                      step="1"
                                      value={measuredFrom ? toLocalTime(measuredFrom).toISOString().slice(0, 19) : ''}
                                      onChange={(e) => setMeasuredFrom(e.target.value)}
                                    />
                                  </td>
                                </tr>
                                <tr>
                                  <td>To:</td>
                                  <td>
                                    <input
                                      type="datetime-local"
                                      step="1"
                                      value={toLocalTime(measuredTo).toISOString().slice(0, 19)}
                                      onChange={(e) => setMeasuredTo(e.target.value)}
                                    />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          )}

                      </div>
                    }

                    {anomalyDecision && (
                      <>
                        <textarea
                          rows={4}
                          placeholder={selectedIssue.message || 'Add a message...'}
                          value={userMessage}
                          onChange={(e) => setUserMessage(e.target.value)}
                          onFocus={(e) => {
                            e.target.style.backgroundColor = '#f9f9f9';
                          }}
                          onBlur={(e) => {
                            e.target.style.backgroundColor = '#ccc';
                          }}
                          style={{
                            width: '100%',
                            padding: '8px',
                            fontSize: '14px',
                            backgroundColor: '#ccc',
                            color: '#014F91',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            resize: 'vertical',
                            marginTop: '20px',
                            marginBottom: '0px',
                          }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', padding: '0px' }}>
                          <button
                            onClick={() => {
                              if (anomalyDecision) {
                                if (device.application === 'Continuous') {
                                  handleAnomalyResponse(anomalyDecision === 'No');
                                }
                                else {
                                  if (selectedIssue.periodFrom !== null) {
                                    handleAnomalyResponse(anomalyDecision === 'No');
                                  }
                                  else {
                                    handleCreatePeriodicIssue(anomalyDecision === 'No')
                                  }
                                }
                              }
                              setAnomalyDecision(null);
                              setUserMessage('');
                            }}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#014F91',
                              border: 'none',
                              borderRadius: '4px',
                              color: 'white',
                              cursor: 'pointer',
                            }}
                          >
                            Submit
                          </button>

                          <button
                            onClick={() => {
                              setCreatingNewIssue(false);
                              setAnomalyDecision(null);
                              setUserMessage('');
                              setApiResponseMessage('');
                            }}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#014F91',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: selectedIssue.confirmed ? 'none' : 'block'
                            }}
                          >
                            Cancel
                          </button>

                          <button
                            onClick={() => { handleDeleteIssue(); }}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#C23B22',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: selectedIssue.confirmed ? 'block' : 'none'
                            }}
                          >
                            {device.application === 'Continuous' ? 'Remove' : 'Delete'}
                          </button>
                        </div>
                      </>
                    )}

                    {apiResponseMessage && (
                      <div style={{ marginTop: '10px', color: '#007BFF' }}>{apiResponseMessage}</div>
                    )}
                  </div>
                }

              </>
            )}

            <div
              className="issue-chart-container"
              style={{
                flex: 1,
                marginTop: detailsCollapsed ? '10px' : anomalyDecision ? '0px' : '10px',
                width: '100%',
                height: detailsCollapsed ? '40%' : (anomalyDecision ? '25%' : '40%'),
              }}>
              <DataChart selectedIssue={selectedIssue} selectedDevice={device} hmacKey={hmacKey} />
            </div>
          </>
        ) : (
          <p>Select an issue to view details.</p>
        )}
      </div>
    </div>
  );
};

export default IssueList;

function formatDateRange(dateString1, dateString2) {
  const date1 = new Date(dateString1);
  const date2 = new Date(dateString2);

  if (!dateString1 && dateString2) return formatDate(date2);
  if (!dateString1 && !dateString2) return '';

  const yyyy1 = date1.getFullYear();
  const mm1 = String(date1.getMonth() + 1).padStart(2, '0');
  const dd1 = String(date1.getDate()).padStart(2, '0');
  const hh1 = String(date1.getHours()).padStart(2, '0');
  const min1 = String(date1.getMinutes()).padStart(2, '0');

  const yyyy2 = date2.getFullYear();
  const mm2 = String(date2.getMonth() + 1).padStart(2, '0');
  const dd2 = String(date2.getDate()).padStart(2, '0');
  const hh2 = String(date2.getHours()).padStart(2, '0');
  const min2 = String(date2.getMinutes()).padStart(2, '0');

  const sameDay = yyyy1 === yyyy2 && mm1 === mm2 && dd1 === dd2;

  if (sameDay) {
    return `${yyyy1}.${mm1}.${dd1} ${hh1}:${min1} - ${hh2}:${min2}`;
  } else {
    return `${yyyy1}.${mm1}.${dd1} ${hh1}:${min1} - ${yyyy2}.${mm2}.${dd2} ${hh2}:${min2}`;
  }
}
