import React, { useEffect, useState, useRef } from 'react';
import { Line } from 'react-chartjs-2';
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
import { toLocalTime } from '../Utils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const RealTimeChart = ({
    device,
    hmacKey,
    startDate,
    endDate,
    small = false,
    openModal = null, // function to open modal, only for small chart
    isModalOpen = false,    // true if this is the modal chart
    visible = true,   // for modal, to control rendering
}) => {
    const [chartData, setChartData] = useState(null);
    const [error, setError] = useState('');
    const intervalRef = useRef();

    // Fetch chart data
    const fetchChartData = async () => {
        if (!device || !hmacKey || !startDate || !endDate) return;
        try {
            const isBidirectional = device.direction === 'BiDirectional';

            const start = encodeURIComponent(toLocalTime(startDate).toISOString().substring(0, 19));
            const end = encodeURIComponent(toLocalTime(endDate).toISOString().substring(0, 19));
            const url = `https://precog.vidasoftapi.com/api/Continuous/MeasuredDateRange?DeviceId=${device.deviceId}&StartDate=${start}&EndDate=${end}`;
            const response = await fetch(url, {
                headers: {
                    accept: '*/*',
                    HMAC_Key: hmacKey,
                },
            });
            if (!response.ok) {
                setError('Failed to load chart data');
                setChartData(null);
                return;
            }
            const data = await response.json();
            setChartData({
                labels: data.map((item) => item.measuredAt),
                datasets: [
                    {
                        label: 'Actual',
                        data: data.map((item) => item.actual),
                        borderColor: '#014F91',
                        backgroundColor: '#014F91',
                        tension: 0.2,
                        pointRadius: small ? 0 : 2,
                        borderWidth: 2,
                    },
                    {
                        label: 'Target',
                        data: data.map((item) => item.target),
                        borderColor: 'gold',
                        borderDash: [5, 5],
                        pointRadius: 0,
                        borderWidth: 1,
                        tension: 0,
                    },
                    {
                        label: 'Tolerance',
                        data: data.map((item) => item.target + item.tolerance),
                        borderColor: 'red',
                        borderDash: [5, 5],
                        pointRadius: 0,
                        borderWidth: 1,
                        tension: 0,
                    },
                ],
            });
            setError('');
        } catch {
            setError('Failed to load chart data');
            setChartData(null);
        }
    };

    // Initial fetch and on prop change
    useEffect(() => {
        if (visible) fetchChartData();
        // eslint-disable-next-line
    }, [device, hmacKey, startDate, endDate, visible]);

    // For modal: refresh every 5s
    useEffect(() => {
        if (!isModalOpen || !visible) return;
        intervalRef.current = setInterval(fetchChartData, 5000);
        return () => clearInterval(intervalRef.current);
        // eslint-disable-next-line
    }, [isModalOpen, device, hmacKey, startDate, endDate, visible]);

    if (!visible) return null;
    if (error) return <div style={{ color: 'red', fontSize: small ? 10 : 16 }}>{error}</div>;
    if (!chartData) return <div style={{ fontSize: small ? 10 : 16 }}>Loading...</div>;

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: isModalOpen, // Only show when modal is open
                text: ('Real time data' + (device ? (' - ' + device.name) : '')),
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

    // For modal, show more detailed x axis
    if (isModalOpen) {
        options.plugins.legend.display = true;
        options.scales.x = {
            ticks: {
                callback: (value, index) => {
                    const label = chartData.labels[index];
                    const d = new Date(label);
                    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                },
                maxRotation: 90,
                minRotation: 90,
            },
        };
    }

    return (
        <div
            style={{
                width: '100%', //small ? 90 : '100%',
                height: small ? '30vh' : '100%',
                cursor: small && openModal ? 'pointer' : undefined,
            }}
            onClick={small && openModal ? (e) => { e.stopPropagation(); openModal(); } : undefined}
            title={small ? "Click to enlarge" : undefined}
        >
            {/* <Line data={chartData} options={options} width={small ? 90 : undefined} height={small ? 40 : undefined} /> */}
            <Line data={chartData} options={options} />
        </div>
    );
};

export default RealTimeChart;