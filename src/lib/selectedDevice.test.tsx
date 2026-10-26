import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { SelectedDeviceProvider } from '@/app/SelectedDeviceProvider';
import { useDeviceSelection } from './selectedDevice';

const DEVICES = [{ id: 1 }, { id: 2 }, { id: 3 }];

/** A stand-in for any page with a Device picker: shows the Device it works with and the URL it ended up on. */
function Page({ name, devices }: { name: string; devices: readonly { id?: number }[] | null }) {
  // null = the Device list has not loaded yet
  const [deviceId, setDeviceId] = useDeviceSelection(devices ?? undefined);
  const location = useLocation();
  return (
    <div>
      <span data-testid={`${name}-device`}>{String(deviceId)}</span>
      <span data-testid={`${name}-url`}>{location.pathname + location.search}</span>
      <button onClick={() => setDeviceId(3)}>{`${name}: pick 3`}</button>
    </div>
  );
}

function App({ initial = '/a', devices = DEVICES }: { initial?: string; devices?: readonly { id?: number }[] | null }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <SelectedDeviceProvider>
        <nav>
          <Link to="/a">to A</Link>
          <Link to="/b">to B</Link>
        </nav>
        <Routes>
          <Route path="/a" element={<Page name="a" devices={devices} />} />
          <Route path="/b" element={<Page name="b" devices={devices} />} />
        </Routes>
      </SelectedDeviceProvider>
    </MemoryRouter>
  );
}

describe('useDeviceSelection', () => {
  it('defaults to the first Device and writes it into the URL', () => {
    render(<App />);
    expect(screen.getByTestId('a-device')).toHaveTextContent('1');
    expect(screen.getByTestId('a-url')).toHaveTextContent('/a?deviceId=1');
  });

  it('keeps the chosen Device when moving to another page, and shows it in that page\'s URL', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'a: pick 3' }));
    expect(screen.getByTestId('a-url')).toHaveTextContent('/a?deviceId=3');

    await user.click(screen.getByRole('link', { name: 'to B' }));
    expect(screen.getByTestId('b-device')).toHaveTextContent('3');
    expect(screen.getByTestId('b-url')).toHaveTextContent('/b?deviceId=3');

    await user.click(screen.getByRole('link', { name: 'to A' }));
    expect(screen.getByTestId('a-device')).toHaveTextContent('3');
  });

  it('lets a deviceId in the URL win, and remembers it for the next page', async () => {
    const user = userEvent.setup();
    render(<App initial="/a?deviceId=2" />);
    expect(screen.getByTestId('a-device')).toHaveTextContent('2');
    await user.click(screen.getByRole('link', { name: 'to B' }));
    expect(screen.getByTestId('b-device')).toHaveTextContent('2');
  });

  it('does not carry a Device that is no longer in the list; it falls back to the first one', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<App devices={DEVICES} />);
    await user.click(screen.getByRole('button', { name: 'a: pick 3' }));
    expect(screen.getByTestId('a-device')).toHaveTextContent('3');

    // Device 3 disappears (deleted, or no longer granted), and the next page is opened without a deviceId.
    rerender(<App devices={[{ id: 1 }, { id: 2 }]} />);
    await user.click(screen.getByRole('link', { name: 'to B' }));
    // A plain link carries no deviceId, so the remembered 3 is checked against the list.
    expect(screen.getByTestId('b-device')).toHaveTextContent('1');
    expect(screen.getByTestId('b-url')).toHaveTextContent('/b?deviceId=1');
  });

  it('waits while the Device list is still loading, without inventing a Device', () => {
    render(<App devices={null} />);
    expect(screen.getByTestId('a-device')).toHaveTextContent('undefined');
    expect(screen.getByTestId('a-url')).toHaveTextContent(/^\/a$/);
  });
});
