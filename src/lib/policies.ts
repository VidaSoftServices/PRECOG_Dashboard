/**
 * True for a Sensor's raw/base aggregation policy - the one the API creates with the Sensor itself: time scale "Native" and
 * aggregation function "Raw". The API sends the names as stored ("Native" / "Raw") while its documentation writes them in lower
 * case, so the comparison ignores case rather than trusting either spelling.
 */
export function isRawPolicy(policy: { timeScale?: string | null; aggregationFunction?: string | null }): boolean {
  return (policy.timeScale ?? '').toLowerCase() === 'native' && (policy.aggregationFunction ?? '').toLowerCase() === 'raw';
}
