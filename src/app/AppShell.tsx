import { Fragment, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  NavDrawer,
  NavDrawerBody,
  NavDrawerHeader,
  NavItem,
  Hamburger,
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbButton,
  BreadcrumbDivider,
  Avatar,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuItemRadio,
  Text,
  makeStyles,
  tokens,
  type MenuCheckedValueChangeData,
} from '@fluentui/react-components';
import {
  WeatherSunny24Regular,
  WeatherMoon24Regular,
  DesktopFlow24Regular,
  ArrowExit20Regular,
} from '@fluentui/react-icons';
import { navEntries } from './navConfig';
import { useAuth } from '@/auth/AuthContext';
import { useAppTheme } from '@/theme/ThemeContext';
import { useBreakpoint } from '@/lib/useMediaQuery';
import precogLogo from '@/images/Precog-Dashboard.svg';

const useStyles = makeStyles({
  shell: {
    display: 'flex',
    minHeight: '100vh',
    background: tokens.colorNeutralBackground2,
  },
  main: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground1,
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  logo: {
    height: '28px',
  },
  content: {
    flex: 1,
    padding: tokens.spacingVerticalL,
    overflowX: 'hidden',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  breadcrumbBar: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} 0`,
  },
});

function useCrumbs(): { label: string; path: string }[] {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const crumbs: { label: string; path: string }[] = [];
  let acc = '';
  for (const segment of segments) {
    acc += `/${segment}`;
    const entry = navEntries.find((e) => e.path === acc);
    crumbs.push({ label: entry?.label ?? decodeURIComponent(segment), path: acc });
  }
  return crumbs;
}

function ThemeMenu() {
  const { preference, setPreference } = useAppTheme();
  const icon =
    preference === 'dark' ? <WeatherMoon24Regular /> : preference === 'light' ? <WeatherSunny24Regular /> : <DesktopFlow24Regular />;

  const onCheckedChange = (_: unknown, data: MenuCheckedValueChangeData) => {
    const next = data.checkedItems[0];
    if (next === 'light' || next === 'dark' || next === 'system') setPreference(next);
  };

  return (
    <Menu checkedValues={{ theme: [preference] }} onCheckedValueChange={onCheckedChange}>
      <MenuTrigger disableButtonEnhancement>
        <ToolbarButton icon={icon} aria-label="Theme" title="Theme" />
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItemRadio name="theme" value="light" icon={<WeatherSunny24Regular />}>
            Light
          </MenuItemRadio>
          <MenuItemRadio name="theme" value="dark" icon={<WeatherMoon24Regular />}>
            Dark
          </MenuItemRadio>
          <MenuItemRadio name="theme" value="system" icon={<DesktopFlow24Regular />}>
            Match system
          </MenuItemRadio>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

export function AppShell() {
  const styles = useStyles();
  const breakpoint = useBreakpoint();
  const isCompact = breakpoint !== 'desktop';
  const [drawerOpen, setDrawerOpen] = useState(!isCompact ? true : false);
  const { isAdmin, userDetails, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const crumbs = useCrumbs();

  const visibleEntries = navEntries.filter((entry) => !entry.adminOnly || isAdmin);

  return (
    <div className={styles.shell}>
      <NavDrawer
        open={isCompact ? drawerOpen : true}
        type={isCompact ? 'overlay' : 'inline'}
        onOpenChange={(_, data) => setDrawerOpen(data.open)}
        selectedValue={location.pathname}
      >
        <NavDrawerHeader>
          <div className={styles.brand}>
            <img src={precogLogo} alt="" className={styles.logo} />
            <Text weight="semibold">PRECOG</Text>
          </div>
        </NavDrawerHeader>
        <NavDrawerBody>
          {visibleEntries.map((entry) => (
            <NavItem
              key={entry.path}
              value={entry.path}
              icon={<entry.icon />}
              onClick={() => {
                navigate(entry.path);
                if (isCompact) setDrawerOpen(false);
              }}
            >
              {entry.label}
            </NavItem>
          ))}
        </NavDrawerBody>
      </NavDrawer>

      <div className={styles.main}>
        <Toolbar className={styles.topBar}>
          <div className={styles.brand}>
            {isCompact && <Hamburger onClick={() => setDrawerOpen((v) => !v)} aria-label="Toggle navigation" />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
            <ThemeMenu />
            <ToolbarDivider />
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <ToolbarButton
                  icon={<Avatar name={userDetails?.displayName ?? undefined} size={24} />}
                  aria-label="Account"
                >
                  {!isCompact && (userDetails?.displayName ?? '…')}
                </ToolbarButton>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem icon={<ArrowExit20Regular />} onClick={logout}>
                    Sign out
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
        </Toolbar>

        {crumbs.length > 0 && (
          <div className={styles.breadcrumbBar}>
            <Breadcrumb>
              {crumbs.map((crumb, index) => (
                // BreadcrumbDivider renders its own <li>, same as
                // BreadcrumbItem - nesting one inside the other (as this
                // used to) produced an invalid <li> inside <li> and tripped
                // React's hydration-mismatch warning. They must be siblings
                // within the <Breadcrumb>'s list.
                <Fragment key={crumb.path}>
                  {index > 0 && <BreadcrumbDivider />}
                  <BreadcrumbItem>
                    <BreadcrumbButton
                      current={index === crumbs.length - 1}
                      onClick={() => navigate(crumb.path)}
                    >
                      {crumb.label}
                    </BreadcrumbButton>
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </Breadcrumb>
          </div>
        )}

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
