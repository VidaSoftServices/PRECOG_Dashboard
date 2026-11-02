import { Fragment, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SelectedDeviceProvider } from './SelectedDeviceProvider';
import { SessionExpiredDialog } from '@/auth/SessionExpiredDialog';
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
  mergeClasses,
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
import { NoCompanyState } from '@/components/states/NoCompanyState';
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
  companyLogo: {
    height: '20px',
    maxWidth: '120px',
    objectFit: 'contain',
  },
  companyName: {
    display: 'block',
    color: tokens.colorNeutralForeground3,
  },
  content: {
    flex: 1,
    padding: tokens.spacingVerticalL,
    // The page title is gone from the top of most pages and the breadcrumb sits in the top bar, so the content starts a little closer to it.
    paddingTop: tokens.spacingVerticalM,
    overflowX: 'hidden',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  // The left of the top bar: the navigation button (narrow screens) and the breadcrumb, which is the page's title.
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flex: '1 1 auto',
    minWidth: 0,
  },
  // The breadcrumb is the page's title now (the big page heading was removed) and sits in the top bar: it is as large as that heading was
  // (Fluent Title2). A deep path wraps instead of running off the page.
  crumbList: {
    flexWrap: 'wrap',
    // The crumb button has its own side padding: pull it back so the first crumb lines up with the page content below.
    marginLeft: '-6px',
  },
  crumbLarge: {
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
    minHeight: tokens.lineHeightHero700,
  },
  // On a narrow screen the title-sized breadcrumb would not fit, so it is one step smaller (Fluent Subtitle1).
  crumbSmall: {
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
    minHeight: tokens.lineHeightBase500,
  },
  crumbCurrent: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

function useCrumbs(): { label: string; path: string }[] {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  // The Overview (the root path) has no segments: it is its own single crumb, so the top bar names it like every other page.
  if (segments.length === 0) return [{ label: navEntries.find((e) => e.path === '/')?.label ?? 'Overview', path: '/' }];
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
  const wasCompact = useRef(isCompact);
  useEffect(() => {
    // drawerOpen's initial value only reflects the breakpoint at first
    // mount - it never re-evaluates on a later live resize. Crossing from
    // desktop (permanently-open inline drawer) into compact/overlay mode
    // otherwise carries that stale "open" over into an overlay that covers
    // the very hamburger button meant to control it (found via direct
    // testing: a live resize across the breakpoint, not a fresh page load
    // already at a narrow width, is the only way to reach this state).
    if (isCompact && !wasCompact.current) setDrawerOpen(false);
    wasCompact.current = isCompact;
  }, [isCompact]);
  const { isAdmin, hasAuthorizedCompany, userDetails, logout } = useAuth();
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
            <div>
              <Text weight="semibold">PRECOG</Text>
              {hasAuthorizedCompany && userDetails?.companyName && (
                <Text size={200} className={styles.companyName}>
                  {userDetails.companyName}
                </Text>
              )}
            </div>
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
        <div className={styles.topBar}>
          <div className={styles.topBarLeft}>
            {isCompact && <Hamburger onClick={() => setDrawerOpen((v) => !v)} aria-label="Toggle navigation" />}
            {crumbs.length > 0 && (
              <Breadcrumb size="large" list={{ className: styles.crumbList }}>
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
                        className={mergeClasses(isCompact ? styles.crumbSmall : styles.crumbLarge, index === crumbs.length - 1 && styles.crumbCurrent)}
                        current={index === crumbs.length - 1}
                        onClick={() => navigate(crumb.path)}
                      >
                        {crumb.label}
                      </BreadcrumbButton>
                    </BreadcrumbItem>
                  </Fragment>
                ))}
              </Breadcrumb>
            )}
          </div>
          <Toolbar aria-label="Page actions" style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
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
          </Toolbar>
        </div>

        <main className={styles.content}>
          <SelectedDeviceProvider>{hasAuthorizedCompany ? <Outlet /> : <NoCompanyState />}</SelectedDeviceProvider>
          <SessionExpiredDialog />
        </main>
      </div>
    </div>
  );
}
