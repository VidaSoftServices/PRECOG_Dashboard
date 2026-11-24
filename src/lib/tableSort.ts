/**
 * Sorting of a list by clicking a column header: the state (which column, which way) and a stable, locale-aware sort of the rows already loaded. A click on another
 * column sorts it ascending, a click on the sorted column reverses it. Empty values always come last, in either direction. A list that is paged by the API sorts on the
 * API instead (the sort state is sent as sortBy / descending), because sorting only the loaded page would be misleading.
 */
export type SortDirection = 'ascending' | 'descending';

export interface SortState<K extends string> {
  key: K | null;
  direction: SortDirection;
}

/** The state after a click on column `key`. */
export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (current.key === key) return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
  return { key, direction: 'ascending' };
}

type SortValue = string | number | boolean | null | undefined;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

/** The rows ordered by the chosen column (`getters` gives each column's value); the input is not changed and ties keep their order. */
export function sortRows<T, K extends string>(rows: readonly T[], state: SortState<K>, getters: Record<K, (row: T) => SortValue>): T[] {
  if (state.key === null) return [...rows];
  const get = getters[state.key];
  const sign = state.direction === 'ascending' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: get(row) }))
    .sort((x, y) => {
      const xEmpty = x.value === null || x.value === undefined || x.value === '';
      const yEmpty = y.value === null || y.value === undefined || y.value === '';
      if (xEmpty || yEmpty) return xEmpty === yEmpty ? x.index - y.index : xEmpty ? 1 : -1;
      return sign * compareValues(x.value, y.value) || x.index - y.index;
    })
    .map((x) => x.row);
}
