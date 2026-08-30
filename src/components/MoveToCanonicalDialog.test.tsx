import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MoveToCanonicalDialog, filterCandidates, issueLabel } from './MoveToCanonicalDialog';
import { mockFetchJsonAlways } from '@/test/mockFetch';
import type { IssueDto } from '@/api/hooks/issues';

function issue(id: number, issueKey: number): IssueDto {
  return { id, issueKey, measuredAtFrom: '2026-01-01T00:00:00Z', isCanonical: true } as IssueDto;
}

describe('filterCandidates', () => {
  const issues = [issue(100, 5000), issue(101, 5001), issue(102, 5002), issue(103, 5003)];

  it('excludes the member Issue being moved and its current canonical group - moving to the same group is a no-op the UI must not offer', () => {
    const result = filterCandidates(issues, 101, 100, '');
    expect(result.map((i) => i.id)).toEqual([102, 103]);
  });

  it('filters by Issue number substring', () => {
    const result = filterCandidates(issues, 101, 100, '5003');
    expect(result.map((i) => i.id)).toEqual([103]);
  });

  it('filters by the full display label (case-insensitive)', () => {
    const result = filterCandidates(issues, 101, 100, issueLabel(issue(102, 5002)).toUpperCase());
    expect(result.map((i) => i.id)).toEqual([102]);
  });

  it('returns everything else when the query is blank/whitespace', () => {
    expect(filterCandidates(issues, 101, 100, '   ').map((i) => i.id)).toEqual([102, 103]);
  });

  it('returns nothing when no candidate matches', () => {
    expect(filterCandidates(issues, 101, 100, 'no-such-issue')).toEqual([]);
  });
});

describe('MoveToCanonicalDialog (render)', () => {
  // Only a render-level check here, deliberately not driving the Combobox
  // open/select interaction: doing so (even after polyfilling
  // ResizeObserver/IntersectionObserver in test/setup.ts, which fixed a
  // separate MessageBar crash elsewhere) hangs this test suite indefinitely
  // - confirmed reproducible in isolation, most likely
  // @fluentui/react-positioning's floating-ui `autoUpdate` looping forever
  // against jsdom's always-zero layout measurements. This is a genuine
  // environment limitation of Fluent's positioned surfaces under jsdom, not
  // something fixable in this component's own code; filterCandidates above
  // covers the actual selection/exclusion logic without needing the popup
  // to really open.
  it('renders with Move disabled until the candidate list has loaded and something is selected', async () => {
    mockFetchJsonAlways(200, [issue(102, 5002)]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <FluentProvider theme={webLightTheme}>
        <QueryClientProvider client={queryClient}>
          <MoveToCanonicalDialog open deviceId={7} memberIssueId={101} currentCanonicalId={100} onConfirm={vi.fn()} onCancel={vi.fn()} />
        </QueryClientProvider>
      </FluentProvider>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });
});
