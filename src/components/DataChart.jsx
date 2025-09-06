import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const DataChart = ({ selectedIssue, selectedDevice, hmacKey }) => {
  const [chartData, setChartData] = useState(null);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false); // 👈 modal state

  useEffect(() => {
    if (!selectedIssue || !selectedDevice) return;

    const fetchChartData = async () => {
      let url = '';
      const deviceId = selectedDevice.deviceId;
      const isBidirectional = selectedDevice.direction === 'BiDirectional';
      const isLowerIsBetter = selectedDevice.direction === 'LowerIsBetter';

      try {
        if (selectedDevice.application === 'Continuous') {
          if (!selectedIssue.periodFrom || !selectedIssue.periodTo) return;

          url = isBidirectional
            ? `https://precog.vidasoftapi.com/api/BiDirectionalContinuous/PeriodRange?DeviceId=${deviceId}&PeriodFrom=${selectedIssue.periodFrom}&PeriodTo=${selectedIssue.periodTo}`
            : `https://precog.vidasoftapi.com/api/Continuous/PeriodRange?DeviceId=${deviceId}&PeriodFrom=${selectedIssue.periodFrom}&PeriodTo=${selectedIssue.periodTo}`;
        } else {
          if (!selectedIssue.issueId) return;

          url = isBidirectional
            ? `https://precog.vidasoftapi.com/api/BiDirectionalPeriodic/CurvePeriodRange?DeviceId=${deviceId}&CurvePeriodFrom=${selectedIssue.issueId}&CurvePeriodTo=${selectedIssue.issueId}`
            : `https://precog.vidasoftapi.com/api/Periodic/CurvePeriodRange?DeviceId=${deviceId}&CurvePeriodFrom=${selectedIssue.issueId}&CurvePeriodTo=${selectedIssue.issueId}`;
        }

        const response = await fetch(url, {
          headers: {
            accept: 'text/plain',
            HMAC_Key: hmacKey,
          },
        });

        const data = await response.json();

        const output =
          selectedDevice.application === 'Continuous'
            ? data
            : data[0]?.outputData || [];

        const datasets = [];

        if (isBidirectional) {
          datasets.push(
            {
              label: 'CriticalAbove',
              data: output.map((item) => item.anomalyAbove === 2 ? item.actual : null),
              borderWidth: 0,
              backgroundColor: 'red',
              tension: 0,
              pointRadius: 10,
              pointHoverRadius: 40,
              tension: 0,
            },
            {
              label: 'WarningAbove',
              data: output.map((item) => item.anomalyAbove === 1 ? item.actual : null),
              borderWidth: 0,
              backgroundColor: 'lightBlue',
              tension: 0,
              pointRadius: 8,
              pointHoverRadius: 40,
              tension: 0,
            },
            {
              label: 'CriticalBelow',
              data: output.map((item) => item.anomalyBelow === 2 ? item.actual : null),
              borderWidth: 0,
              backgroundColor: 'blue',
              tension: 0,
              pointRadius: 10,
              pointHoverRadius: 40,
              tension: 0,
            },
            {
              label: 'WarningBelow',
              data: output.map((item) => item.anomalyBelow === 1 ? item.actual : null),
              borderWidth: 0,
              backgroundColor: 'gold',
              tension: 0,
              pointRadius: 8,
              pointHoverRadius: 40,
              tension: 0,
            },
            {
              label: 'Tolerance Above',
              data: output.map((item) => item.targetAbove + item.toleranceAbove),
              backgroundColor: 'white',
              borderColor: 'darkBlue',
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 1.5,
              tension: 0,
            },
            {
              label: 'Target Above',
              data: output.map((item) => item.targetAbove),
              backgroundColor: 'white',
              borderColor: 'lightBlue',
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 1.5,
              tension: 0,
            },
            {
              label: 'Target Below',
              data: output.map((item) => item.targetBelow),
              backgroundColor: 'white',
              borderColor: 'Gold',
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 1.5,
              tension: 0,
            },
            {
              label: 'Tolerance Below',
              data: output.map((item) => item.targetBelow - item.toleranceBelow),
              backgroundColor: 'white',
              borderColor: 'red',
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 1.5,
              tension: 0,
            }
          );
        } else {
          datasets.push(
            {
              label: 'Critical',
              data: output.map((item) => item.anomaly === 2 ? item.actual : null),
              borderWidth: 0,
              backgroundColor: 'red',
              tension: 0,
              pointRadius: 10,
              pointHoverRadius: 40,
              tension: 0,
            },
            {
              label: 'Warning',
              data: output.map((item) => item.anomaly === 1 ? item.actual : null),
              borderWidth: 0,
              backgroundColor: 'gold',
              tension: 0,
              pointRadius: 8,
              pointHoverRadius: 40,
              tension: 0,
            },
            {
              label: 'Target',
              data: output.map((item) => item.target),
              backgroundColor: 'white',
              borderColor: 'Gold',
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 4,
              tension: 0,
            },
            {
              label: 'Tolerance',
              data: output.map((item) => isLowerIsBetter ? item.target + item.tolerance : item.target - item.tolerance),
              borderColor: 'red',
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 4,
              tension: 0,
            },
          );
        }


        datasets.push(
          {
            label: 'Actual',
            data: output.map((item) => item.actual),
            borderColor: '#014F91',
            backgroundColor: output.map((item) => (item.anomaly === 0 || item.anomalyAbove === 0 || item.anomalyBelow === 0) ? '#014F91' : 'rgba(1, 79, 145, 0.5)'),
            tension: 0.2,
            pointRadius: output.map((item) => item.anomaly === 0 ? 8 : 6),
            pointHoverRadius: output.map((item) => item.anomaly === 0 ? 40 : 30),
          },
          {
            label: 'UCL3',
            data: output.map((item) => item.upperControlLimit3S),
            borderColor: 'grey',
            borderDash: [30, 15],
            pointRadius: 0,
            borderWidth: 1.5,
            tension: 0.1,
            hidden: isModalOpen ? false : true,
          },
          {
            label: 'UCL2',
            data: output.map((item) => item.upperControlLimit2S),
            borderColor: 'lightGrey',
            backgroundColor: '#f5f5f5',
            borderDash: [30, 15],
            pointRadius: 0,
            borderWidth: 1.5,
            tension: 0.1,
            hidden: isModalOpen ? false : true,
            fill: '-1',
          },
          {
            label: 'LCL2',
            data: output.map((item) => item.lowerControlLimit2S),
            borderColor: 'lightGrey',
            borderDash: [30, 15],
            pointRadius: 0,
            borderWidth: 1.5,
            tension: 0.1,
            hidden: isModalOpen ? false : true,
          },
          {
            label: 'LCL3',
            data: output.map((item) => item.lowerControlLimit3S),
            borderColor: 'grey',
            backgroundColor: '#f5f5f5',
            borderDash: [30, 15],
            pointRadius: 0,
            borderWidth: 1.5,
            tension: 0.1,
            hidden: isModalOpen ? false : true,
            fill: '-1',
          },
        );

        setChartData({
          labels: output.map((item) => item.measuredAt),
          datasets,
        });
        setError('');
      } catch (err) {
        console.error('Failed to fetch chart data:', err);
        setError('Failed to load chart data.');
      }
    };

    fetchChartData();
  }, [selectedIssue, selectedDevice, hmacKey, isModalOpen]);

  if (!selectedIssue) return null;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!chartData) return <p>Loading chart...</p>;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: isModalOpen, // Only show when modal is open
        text: (selectedIssue.periodFrom !== null ? 'Issue #' : 'Curve Period #') + selectedIssue.issueId,
        font: {
          size: 20
        },
        padding: {
          top: 0,
          bottom: 0
        }
      },
      legend: {
        position: 'top',
        labels: {
          filter: function (legendItem, data) {
            // Filter out specific labels from the legend
            return !['Critical', 'Warning', 'CriticalAbove', 'WarningAbove', 'CriticalBelow', 'WarningBelow'].includes(legendItem.text);
          }
        }
      },
    },
    scales: {
      x: {
        ticks: {
          callback: (value, index) => {
            const label = chartData.labels[index];
            const d = new Date(label);

            return isModalOpen
              ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ` +
              `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
              : `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
          },
          maxRotation: 90,
          minRotation: 90,
        },
      },
    },
  };


  return (
    <>
      {/* Regular embedded chart */}
      <div
        onClick={() => setIsModalOpen(true)}
        style={{ position: 'relative', height: '100%', width: '100%', cursor: 'pointer' }}
        title="Click to enlarge"
      >
        <Line data={chartData} options={chartOptions} />
      </div>

      {/* Modal fullscreen chart */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              width: '90%',
              height: '80%',
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '10px',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsModalOpen(false)}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: 'transparent',
                border: 'none',
                fontSize: '24px',
                color: '#014F91',
                cursor: 'pointer',
              }}
              title="Close"
            >
              ×
            </button>
            <div style={{ height: '100%', width: '100%' }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DataChart;
