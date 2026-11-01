import type { TelemetryPoint } from '@/api/hooks/telemetry';

/**
 * What the platform has NOT stored for the readings of a chart: the Target / Tolerance come from the Sensor's setpoint; the control limits
 * (UCL3, UCL2, LCL2, LCL3 - the average plus/minus 2 and 3 standard deviations of the readings, nothing to do with target or tolerance)
 * are calculated by the platform for EVERY reading while the Sensor's calculation is switched on, setpoint or not, and for the readings
 * stored earlier when it is switched on. The dashboard never computes any of them, so when they are missing the chart simply has no such
 * line - this says what is known instead of leaving the user to wonder.
 *
 * Returns undefined when nothing is missing (or there are no readings at all).
 */
export function missingReferenceNotice(points: readonly TelemetryPoint[]): { title: string; text: string } | undefined {
  if (points.length === 0) return undefined;
  const hasTarget = points.some((p) => p.target != null || p.targetAbove != null || p.targetBelow != null);
  const hasLimits = points.some(
    (p) => p.upperControlLimit3S != null || p.upperControlLimit2S != null || p.lowerControlLimit2S != null || p.lowerControlLimit3S != null,
  );
  if (hasTarget && hasLimits) return undefined;
  if (!hasTarget && !hasLimits) {
    return {
      title: 'No Target, Tolerance or control limits',
      text:
        'The platform has stored none for these readings. The Target and Tolerance come from the Sensor\'s setpoint (Policies page). The control limits (UCL3, UCL2, LCL2, LCL3: the average plus/minus 2 and 3 standard deviations of the readings) are calculated for every reading while the Sensor\'s calculation is switched on (the "Calculate" switch on the Device page), whether it has a setpoint or not. Switching it on also calculates them for the readings stored earlier.',
    };
  }
  if (!hasLimits) {
    return {
      title: 'No control limits yet',
      text:
        'The platform has not stored UCL3, UCL2, LCL2 and LCL3 for these readings. They are the average plus/minus 2 and 3 standard deviations of the readings, calculated for every reading while the Sensor\'s calculation is switched on (the "Calculate" switch on the Device page), whether it has a setpoint or not. If it is off, switch it on: the limits of the stored readings are then calculated; if it is on, they appear once the platform has worked through the readings.',
    };
  }
  return {
    title: 'No Target or Tolerance',
    text: 'These readings have no Target or Tolerance: they come from the Sensor\'s setpoint (Policies page).',
  };
}
