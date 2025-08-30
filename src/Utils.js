export function toLocalTime(date) {
  if (!date) return '';
  if (!(date instanceof Date)) return new Date(date.replace(' ', 'T') + 'Z');
  if ((date instanceof Date) && !isNaN(date.getTime())) return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return '';
}