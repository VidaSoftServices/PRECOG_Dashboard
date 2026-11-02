import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { PageHeader } from './PageHeader';

function renderHeader(props: React.ComponentProps<typeof PageHeader>) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <PageHeader {...props} />
    </FluentProvider>,
  );
}

describe('PageHeader', () => {
  it('shows no title on screen by default (the breadcrumb names the page), but keeps it as the page heading for assistive technology', () => {
    const { container } = renderHeader({ title: 'Devices', description: 'Devices accessible to you.' });

    expect(container.querySelector('.fui-Title2, .fui-Subtitle1')).toBeNull(); // no visible title
    expect(screen.getByRole('heading', { level: 1, name: 'Devices' })).toBeInTheDocument();
    expect(screen.getByText('Devices accessible to you.')).toBeInTheDocument(); // the description and the actions stay
  });

  it('keeps the actions next to the description when the title is hidden', () => {
    renderHeader({ title: 'Issues', description: 'Canonical Issues.', actions: <button>Group</button> });

    expect(screen.getByRole('button', { name: 'Group' })).toBeInTheDocument();
  });

  it('renders only the hidden heading when there is neither a description nor actions (no empty row to take space)', () => {
    const { container } = renderHeader({ title: 'Logs' });

    expect(container.querySelector('h1')).not.toBeNull();
    expect(container.querySelectorAll('div').length).toBe(1); // just the FluentProvider's own wrapper
  });

  it("'large' shows the full-size title (the Overview has no breadcrumb)", () => {
    const { container } = renderHeader({ title: 'Overview', titleDisplay: 'large' });

    expect(container.querySelector('.fui-Title2')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
  });

  it("'compact' shows a small heading, for a page whose title is a name the breadcrumb does not carry", () => {
    const { container } = renderHeader({ title: 'AHU1', titleDisplay: 'compact' });

    expect(container.querySelector('.fui-Subtitle1')).not.toBeNull();
    expect(container.querySelector('.fui-Title2')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'AHU1' })).toBeInTheDocument();
  });

  it('a secondary h2 header is always shown, whatever titleDisplay says', () => {
    const { container } = renderHeader({ title: 'Sensors', level: 'h2' });

    expect(container.querySelector('.fui-Title2')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Sensors' })).toBeInTheDocument();
  });
});
