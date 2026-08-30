import type { FluentIcon } from '@fluentui/react-icons';
import {
  Home24Regular,
  DeviceMeetingRoom24Regular,
  PulseSquare24Regular,
  DataTrending24Regular,
  Warning24Regular,
  Tag24Regular,
  Share24Regular,
  BrainCircuit24Regular,
  ChatSparkle24Regular,
  PeopleTeam24Regular,
  Settings24Regular,
  HeartPulse24Regular,
} from '@fluentui/react-icons';

export interface NavEntry {
  path: string;
  label: string;
  icon: FluentIcon;
  /** true = Admin only, false = Admin + Reader, per the role model in the modernization audit. */
  adminOnly: boolean;
}

/** Single source of truth for both the NavDrawer and the top-level route table, so they can't drift apart. */
export const navEntries: NavEntry[] = [
  { path: '/', label: 'Overview', icon: Home24Regular, adminOnly: false },
  { path: '/devices', label: 'Devices', icon: DeviceMeetingRoom24Regular, adminOnly: false },
  { path: '/monitoring', label: 'Live Monitoring', icon: PulseSquare24Regular, adminOnly: false },
  { path: '/analytics', label: 'Smart Analytics', icon: DataTrending24Regular, adminOnly: false },
  { path: '/issues', label: 'Issues', icon: Warning24Regular, adminOnly: false },
  { path: '/categories', label: 'Categories', icon: Tag24Regular, adminOnly: true },
  { path: '/knowledge-sharing', label: 'Knowledge Sharing', icon: Share24Regular, adminOnly: true },
  { path: '/training', label: 'Training & Models', icon: BrainCircuit24Regular, adminOnly: false },
  { path: '/ollama-jobs', label: 'Ollama Jobs', icon: ChatSparkle24Regular, adminOnly: false },
  { path: '/admin/readers', label: 'Readers & Access', icon: PeopleTeam24Regular, adminOnly: true },
  { path: '/admin/settings', label: 'Company Settings', icon: Settings24Regular, adminOnly: true },
  { path: '/status', label: 'System Status', icon: HeartPulse24Regular, adminOnly: false },
];
