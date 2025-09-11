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
        if (!device || !hmacKey || !startDate || !endDate || device.application !== 'Continuous') return;
        try {
            const isBidirectional = device.direction === 'BiDirectional';
            const isLowerIsBetter = device.direction === 'LowerIsBetter';

            const end = encodeURIComponent(toLocalTime(endDate).toISOString().substring(0, 19));
            let url = '';
            url = isBidirectional
                ? url = `https://precog.vidasoftapi.com/api/BiDirectionalContinuous/MeasuredTrailingPeriods?DeviceId=${device.deviceId}&EndDate=${end}&Periods=40`
                : url = `https://precog.vidasoftapi.com/api/Continuous/MeasuredTrailingPeriods?DeviceId=${device.deviceId}&EndDate=${end}&Periods=40`;
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

            const output =
                device.application === 'Continuous'
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