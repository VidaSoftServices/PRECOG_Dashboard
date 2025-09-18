export function toLocalTime(date) {
  if (!date) return '';
  if (!(date instanceof Date)) return new Date(date.replace(' ', 'T') + 'Z');
  if ((date instanceof Date) && !isNaN(date.getTime())) return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return '';
}

// Fetch recent time-series data for a device
// Returns an array like: [{ measuredAt, actual }]
export async function fetchDeviceData(deviceId, hmacKey, endDate = new Date(), { periods = 40, biDirectional = false } = {}) {
  if (!deviceId || !hmacKey) return [];
  try {
    const end = encodeURIComponent(toLocalTime(endDate).toISOString().substring(0, 19));
    const base = biDirectional
      ? 'https://precog.vidasoftapi.com/api/BiDirectionalContinuous/MeasuredTrailingPeriods'
      : 'https://precog.vidasoftapi.com/api/Continuous/MeasuredTrailingPeriods';
    const url = `${base}?DeviceId=${deviceId}&EndDate=${end}&Periods=${periods}`;

    const response = await fetch(url, {
      headers: {
        accept: '*/*',
        HMAC_Key: hmacKey,
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    const output = Array.isArray(data) ? data : (data?.outputData || []);
      return (output || []).map(item => ({ 
        measuredAt: item.measuredAt, 
        actual: item.actual,
        upperControlLimit3S: item.upperControlLimit3S,
        upperControlLimit2S: item.upperControlLimit2S,
        lowerControlLimit2S: item.lowerControlLimit2S,
        lowerControlLimit3S: item.lowerControlLimit3S,
        target: item.target,
        tolerance: item.tolerance,
        anomaly: item.anomaly,
        anomalyAbove: item.anomalyAbove,
        anomalyBelow: item.anomalyBelow,
        targetAbove: item.targetAbove,
        toleranceAbove: item.toleranceAbove,
        targetBelow: item.targetBelow,
        toleranceBelow: item.toleranceBelow,
      }));
  } catch {
    return [];
  }
}