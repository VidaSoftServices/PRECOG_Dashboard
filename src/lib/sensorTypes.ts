/**
 * Which of the Sensor types already in use to offer in the "Sensor type" dropdown for what is typed so far.
 *
 * - nothing typed, or exactly an existing type (any case): the whole list, so the dropdown can always be re-opened and
 *   another type chosen;
 * - otherwise the types that contain the typed text, ignoring case. No match gives an empty list - the typed text is then
 *   simply a new type (the field stays free text).
 * Pure and presentation-only: the list itself comes from the API and is never extended or corrected here.
 */
export function filterSensorTypes(types: readonly string[], typed: string): string[] {
  const needle = typed.trim().toLowerCase();
  if (needle === '' || types.some((t) => t.toLowerCase() === needle)) return [...types];
  return types.filter((t) => t.toLowerCase().includes(needle));
}
