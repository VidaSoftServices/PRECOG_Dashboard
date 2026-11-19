import { HU_ADMIN } from './translations.admin';
import { HU_DEVICES } from './translations.devices';
import { HU_MISC } from './translations.misc';
import { HU_FRAGMENTS } from './translations.fragments';
import { HU_DYNAMIC } from './translations.dynamic';
import { HU_STATUS } from './translations.status';

/** Hungarian texts, keyed by the English text (see language.ts). Add every new UI string here. */
export const HU: Record<string, string> = {
  ...HU_ADMIN,
  ...HU_DEVICES,
  ...HU_MISC,
  ...HU_FRAGMENTS,
  ...HU_DYNAMIC,
  ...HU_STATUS,
  Overview: 'Áttekintés',
  Devices: 'Eszközök',
  'Live Monitoring': 'Élő megfigyelés',
  'Smart Analytics': 'Elemzés',
  Issues: 'Problémák',
  Categories: 'Kategóriák',
  'Knowledge Sharing': 'Tudásmegosztás',
  'Training & Models': 'Tanítás és modellek',
  'Ollama Jobs': 'Ollama feladatok',
  'Users & Access': 'Felhasználók és hozzáférés',
  'Company Settings': 'Cégbeállítások',
  Logs: 'Naplók',
  'System Status': 'Rendszerállapot',
  Theme: 'Téma',
  Light: 'Világos',
  Dark: 'Sötét',
  'Match system': 'Rendszer szerint',
  Language: 'Nyelv',
  English: 'English',
  Hungarian: 'Magyar',
  Account: 'Fiók',
  'Sign out': 'Kijelentkezés',
  'Toggle navigation': 'Navigáció váltása',
  'Page actions': 'Oldal műveletei',
  'About this indicator': 'A mutatóról',
  'About these indicators': 'A mutatókról',
  'Import descriptions': 'Leírások importálása',
};
