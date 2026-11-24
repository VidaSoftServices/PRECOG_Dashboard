import type { ReactNode } from 'react';
import { TableHeaderCell } from '@fluentui/react-components';
import type { SortDirection, SortState } from '@/lib/tableSort';

/** A table header cell that sorts its column when clicked (Fluent's sortable header: a button, the arrow of the sorted column and aria-sort). */
export function SortHeaderCell<K extends string>({
  column,
  sort,
  onSort,
  children,
}: {
  column: K;
  sort: SortState<K>;
  onSort: (column: K) => void;
  children: ReactNode;
}) {
  const direction: SortDirection | undefined = sort.key === column ? sort.direction : undefined;
  return (
    <TableHeaderCell sortable sortDirection={direction} onClick={() => onSort(column)}>
      {children}
    </TableHeaderCell>
  );
}
