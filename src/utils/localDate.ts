/** Calendar key in the device timezone; audit timestamps remain UTC. */
export function localDateKey(date: Date = new Date()): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid calendar date');
  return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
