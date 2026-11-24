import { describe, it, expect } from 'vitest';
import { nextSort, sortRows, type SortState } from './tableSort';

type Row = { name: string | null; count: number; on: boolean };
const rows: Row[] = [
  { name: 'beta', count: 10, on: true },
  { name: null, count: 2, on: false },
  { name: 'Alpha', count: 1, on: true },
  { name: 'gamma', count: 2, on: false },
];
const getters = { name: (r: Row) => r.name, count: (r: Row) => r.count, on: (r: Row) => r.on };

describe('tableSort', () => {
  it('a click on a new column sorts it ascending, a click on the sorted column reverses it', () => {
    let state: SortState<'name' | 'count'> = { key: null, direction: 'ascending' };
    state = nextSort(state, 'name');
    expect(state).toEqual({ key: 'name', direction: 'ascending' });
    state = nextSort(state, 'name');
    expect(state).toEqual({ key: 'name', direction: 'descending' });
    state = nextSort(state, 'count');
    expect(state).toEqual({ key: 'count', direction: 'ascending' });
  });

  it('sorts text without regard to case, numbers numerically, and puts empty values last in both directions', () => {
    expect(sortRows(rows, { key: 'name', direction: 'ascending' }, getters).map((r) => r.name)).toEqual(['Alpha', 'beta', 'gamma', null]);
    expect(sortRows(rows, { key: 'name', direction: 'descending' }, getters).map((r) => r.name)).toEqual(['gamma', 'beta', 'Alpha', null]);
    expect(sortRows(rows, { key: 'count', direction: 'ascending' }, getters).map((r) => r.count)).toEqual([1, 2, 2, 10]);
    expect(sortRows(rows, { key: 'count', direction: 'descending' }, getters).map((r) => r.count)).toEqual([10, 2, 2, 1]);
  });

  it('keeps the original order of ties, sorts booleans, and leaves the input and an unsorted list alone', () => {
    const byCount = sortRows(rows, { key: 'count', direction: 'ascending' }, getters);
    expect(byCount[1]!.name).toBeNull(); // the two rows with count 2 keep their relative order
    expect(sortRows(rows, { key: 'on', direction: 'ascending' }, getters).map((r) => r.on)).toEqual([false, false, true, true]);
    expect(sortRows(rows, { key: null, direction: 'ascending' }, getters)).toEqual(rows);
    expect(rows[0]!.name).toBe('beta');
  });
});
