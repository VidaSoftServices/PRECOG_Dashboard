import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { NoRoleState } from './NoRoleState';
import { CompanyDisabledState } from './CompanyDisabledState';
import { setLanguage } from '@/lib/language';

const renderState = (node: React.ReactNode) => render(<FluentProvider theme={webLightTheme}>{node}</FluentProvider>);

beforeEach(() => setLanguage('en'));

describe('the states of a person who cannot work', () => {
  it('a person with no role is told to ask for one', () => {
    renderState(<NoRoleState />);
    expect(screen.getByText('You have no access yet')).toBeInTheDocument();
    expect(screen.getByText(/not been given a role/)).toBeInTheDocument();
  });

  it('a disabled company says so, in Hungarian too', () => {
    setLanguage('hu');
    renderState(<CompanyDisabledState />);
    expect(screen.getByText('A céged le van tiltva')).toBeInTheDocument();
  });
});
