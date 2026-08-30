import React, { useMemo, useState } from 'react';
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

/**
 * CompareChart
 * Renders multiple time-series datasets on a single chart for visual comparison.
 *
 * Props:
 * - devicesData: Array<{ data: Array, name: string }> - Array of device data objects
 * - OR legacy props for backward compatibility:
 *   - device1Data: Array<{ measuredAt: string|number|Date, actual?: number, value?: number }>
 *   - device2Data: Array<{ measuredAt: string|number|Date, actual?: number, value?: number }>
 *   - device1Name: string
 *   - device2Name: string
 */
const CompareChart = ({ 
  devicesData = [], 
  device1Data = [], 
  device2Data = [], 
  device1Name = 'Device 1', 
  device2Name = 'Device 2' 
}) => {
	const [isModalOpen, setIsModalOpen] = useState(false);

	// 8 színből álló paletta (piros nélkül) — első színek jól elütők: kék, narancs, stb.
	const colorPalette = [
		'rgba(1, 79, 145, 1)',     // sötétkék (első)
		'rgba(255, 159, 64, 1)',   // narancssárga (második)
		'rgba(102, 16, 242, 1)',   // lila
		'rgba(0, 123, 255, 1)',    // világoskék
		'rgba(25, 135, 84, 1)',    // zöld
		'rgba(23, 162, 184, 1)',   // türkiz
		'rgba(111, 66, 193, 1)',   // sötétlila
		'rgba(255, 205, 86, 1)',   // sárga
	];

	// Backward compatibility: ha devicesData nincs megadva, használjuk a régi props-okat
	const processedDevicesData = devicesData.length > 0 
		? devicesData 
		: [
			{ data: device1Data, name: device1Name },
			{ data: device2Data, name: device2Name }
		].filter(device => device.data && device.data.length > 0);
	// Normalize input rows to preserve all API data including anomaly fields
	const normalize = (rows) => {
		return (rows || []).map((row) => {
			const measuredAtRaw = row?.measuredAt ?? row?.timestamp ?? row?.time ?? null;
			const valueRaw = row?.actual ?? row?.value ?? row?.y ?? null;
			const measuredAt = measuredAtRaw instanceof Date
				? measuredAtRaw.toISOString()
				: (typeof measuredAtRaw === 'number'
					? new Date(measuredAtRaw).toISOString()
					: (measuredAtRaw ? new Date(measuredAtRaw).toISOString() : null));
			return {
				measuredAt,
				actual: typeof valueRaw === 'number' ? valueRaw : (valueRaw == null ? null : Number(valueRaw)),
				// Preserve all anomaly and limit data from API
				anomaly: row?.anomaly ?? 0,
				anomalyAbove: row?.anomalyAbove ?? 0,
				anomalyBelow: row?.anomalyBelow ?? 0,
				upperControlLimit3S: row?.upperControlLimit3S,
				upperControlLimit2S: row?.upperControlLimit2S,
				lowerControlLimit2S: row?.lowerControlLimit2S,
				lowerControlLimit3S: row?.lowerControlLimit3S,
				target: row?.target,
				tolerance: row?.tolerance,
				targetAbove: row?.targetAbove,
				toleranceAbove: row?.toleranceAbove,
				targetBelow: row?.targetBelow,
				toleranceBelow: row?.toleranceBelow,
			};
		}).filter((r) => r.measuredAt !== null && !Number.isNaN(r.actual));
	};

	const { labels, deviceSeries, deviceData, combinedLimits, deviceNames } = useMemo(() => {
		// Normalize all device data
		const normalizedDevices = processedDevicesData.map(device => ({
			...device,
			data: normalize(device.data)
		}));

		// Build a sorted, de-duplicated union of timestamps from all devices
		const labelSet = new Set();
		normalizedDevices.forEach(device => {
			device.data.forEach((r) => labelSet.add(r.measuredAt));
		});
		const labelsArr = Array.from(labelSet).sort((x, y) => new Date(x) - new Date(y));

		// Create maps for each device for quick lookup
		const deviceMaps = normalizedDevices.map(device => 
			new Map(device.data.map((r) => [r.measuredAt, r]))
		);

		// Create series data for each device
		const deviceSeries = deviceMaps.map(map => 
			labelsArr.map((t) => (map.has(t) ? map.get(t).actual : null))
		);

		// Get full data objects for each device (preserving all API fields)
		const deviceData = deviceMaps.map(map => 
			labelsArr.map((t) => map.get(t) || null)
		);

		// Compute combined limits: max upper, min lower across all devices
		const combinedLimits = labelsArr.map((t) => {
			const items = deviceMaps.map(map => map.get(t)).filter(Boolean);
			
			if (items.length === 0) return null;
			
			return {
				upperControlLimit3S: Math.max(...items.map(item => item.upperControlLimit3S || 0)),
				upperControlLimit2S: Math.max(...items.map(item => item.upperControlLimit2S || 0)),
				lowerControlLimit2S: Math.min(...items.map(item => item.lowerControlLimit2S || 0)),
				lowerControlLimit3S: Math.min(...items.map(item => item.lowerControlLimit3S || 0)),
			};
		});

		return { 
			labels: labelsArr, 
			deviceSeries, 
			deviceData, 
			combinedLimits,
			deviceNames: processedDevicesData.map(d => d.name)
		};
	}, [processedDevicesData]);

	const data = useMemo(() => {
		const datasets = [];

		// Generate anomaly points and main data lines for each device
		deviceSeries.forEach((series, deviceIndex) => {
			const deviceName = deviceNames[deviceIndex];
			const deviceDataPoints = deviceData[deviceIndex];
			const color = colorPalette[deviceIndex % colorPalette.length];
			const device = processedDevicesData[deviceIndex];
			const isBidirectional = device?.data?.[0]?.anomalyAbove !== undefined || device?.data?.[0]?.anomalyBelow !== undefined;

			// Always add anomaly datasets (like DataChart does)
			datasets.push(
				{
					label: `Critical${deviceIndex + 1}`,
					data: deviceDataPoints.map((item) => item?.anomaly === 2 ? item.actual : null),
					borderWidth: 0,
					backgroundColor: 'red',
					tension: 0,
					pointRadius: 10,
					pointHoverRadius: 40,
				},
				{
					label: `Warning${deviceIndex + 1}`,
					data: deviceDataPoints.map((item) => item?.anomaly === 1 ? item.actual : null),
					borderWidth: 0,
					backgroundColor: 'gold',
					tension: 0,
					pointRadius: 8,
					pointHoverRadius: 40,
				}
			);

			// Main data line for this device (like DataChart's "Actual" line)
			datasets.push({
				label: deviceName,
				data: series,
				borderColor: color,
				backgroundColor: color, // csak a vonalhoz
				pointBackgroundColor: deviceDataPoints.map((item) => {
					const hasAnomaly = isBidirectional 
						? (item?.anomalyAbove !== 0 || item?.anomalyBelow !== 0)
						: (item?.anomaly !== 0);
					return hasAnomaly ? color.replace('1)', '0.5)') : color;
				}),
				tension: 0.2,
				pointRadius: deviceDataPoints.map((item) => {
					const hasAnomaly = isBidirectional 
						? (item?.anomalyAbove !== 0 || item?.anomalyBelow !== 0)
						: (item?.anomaly !== 0);
					return hasAnomaly ? 6 : 8;  // Back to original: normal points 8px, anomaly points 6px
				}),
				pointHoverRadius: deviceDataPoints.map((item) => {
					const hasAnomaly = isBidirectional 
						? (item?.anomalyAbove !== 0 || item?.anomalyBelow !== 0)
						: (item?.anomaly !== 0);
					return hasAnomaly ? 30 : 40;
				}),
			});
		});

		// Combined control limits - only show for single device comparison
		if (processedDevicesData.length <= 1) {
			datasets.push(
				{
					label: 'UCL3',
					data: combinedLimits.map(item => item?.upperControlLimit3S || null),
					borderColor: 'grey',
					borderDash: [30, 15],
					pointRadius: 0,
					borderWidth: 1.5,
					tension: 0.1,
					hidden: isModalOpen ? false : true,
				},
				{
					label: 'UCL2',
					data: combinedLimits.map(item => item?.upperControlLimit2S || null),
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
					data: combinedLimits.map(item => item?.lowerControlLimit2S || null),
					borderColor: 'lightGrey',
					borderDash: [30, 15],
					pointRadius: 0,
					borderWidth: 1.5,
					tension: 0.1,
					hidden: isModalOpen ? false : true,
				},
				{
					label: 'LCL3',
					data: combinedLimits.map(item => item?.lowerControlLimit3S || null),
					borderColor: 'grey',
					backgroundColor: '#f5f5f5',
					borderDash: [30, 15],
					pointRadius: 0,
					borderWidth: 1.5,
					tension: 0.1,
					hidden: isModalOpen ? false : true,
					fill: '-1',
				}
			);
		}

		return {
			labels,
			datasets,
		};
	}, [labels, deviceSeries, deviceNames, combinedLimits, deviceData, isModalOpen, colorPalette]);

	const options = useMemo(() => ({
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			title: {
				display: isModalOpen,
				text: `Comparison: ${device1Name} vs ${device2Name}`,
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
						// Filter out all anomaly labels from the legend (like DataChart does)
						return !legendItem.text.includes('Critical') && !legendItem.text.includes('Warning');
					}
				}
			},
		},
		scales: {
			x: {
				ticks: {
					callback: (value, index) => {
						const label = labels[index];
						const d = new Date(label);
						if (Number.isNaN(d.getTime())) return label;
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
	}), [labels, isModalOpen, device1Name, device2Name]);

	return (
		<>
			{/* Regular embedded chart */}
			<div
				onClick={() => setIsModalOpen(true)}
				style={{ position: 'relative', height: '100%', width: '100%', cursor: 'pointer' }}
				title="Click to enlarge"
			>
				<Line data={data} options={options} />
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
							maxHeight: '800px',
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
							<Line data={data} options={options} />
						</div>
					</div>
				</div>
			)}
		</>
	);
};

export default CompareChart;


