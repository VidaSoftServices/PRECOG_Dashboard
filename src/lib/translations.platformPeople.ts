/**
 * Hungarian texts of the platform administrator's company and people management (S9b), keyed by the English text: the People page, the Company profile,
 * the last-Admin question, the states of a person with no role / of a disabled company, and the API's refusals these pages can show.
 */
export const HU_PLATFORM_PEOPLE: Record<string, string> = {
  // The People page
  'Every person of every company. Only the platform administrator can change a person\'s company.': 'Minden cég minden embere. Egy ember cégét csak a platform adminisztrátor változtathatja.',
  Search: 'Keresés',
  'Name or e-mail address': 'Név vagy e-mail-cím',
  'All companies': 'Minden cég',
  'Any role': 'Bármely szerepkör',
  'Any state': 'Bármely állapot',
  'No people match': 'Nincs a szűrésnek megfelelő ember',
  'Change company': 'Cég váltása',
  'New company': 'Új cég',
  'Choose a company': 'Válassz céget',
  Move: 'Áthelyezés',
  '{0} moves to the company you choose. The person loses every role and Device access in the old company and arrives without a role - it sees nothing until someone gives it one.':
    '{0} átkerül a kiválasztott cégbe. Az ember elveszíti a régi cégben minden szerepkörét és eszköz-hozzáférését, és szerepkör nélkül érkezik – addig semmit sem lát, amíg valaki szerepkört nem ad neki.',
  'Disable this person?': 'Letiltod ezt az embert?',
  '{0} can no longer sign in. The person and their history stay; you can enable them again.': '{0} többé nem tud bejelentkezni. Az ember és az előzményei megmaradnak, később újra engedélyezheted.',
  'Remove this person?': 'Eltávolítod ezt az embert?',
  '{0} is removed from {1}. A person with a history is deactivated instead of deleted.': '{0} el lesz távolítva a(z) {1} cégből. Az előzménnyel rendelkező embert törlés helyett inaktiválja a rendszer.',
  'The person was moved': 'Az ember át lett helyezve',
  'The person was enabled': 'Az ember engedélyezve lett',
  'The person was disabled': 'Az ember le lett tiltva',
  'The person was removed': 'Az ember el lett távolítva',
  Previous: 'Előző',
  '{0}-{1} of {2}': '{0}–{1} / {2}',

  // The Company page
  'This company is disabled: its Devices are not accepted and its people cannot sign in or work.': 'Ez a cég le van tiltva: az eszközei adatait nem fogadja a rendszer, az emberei nem tudnak bejelentkezni és dolgozni.',
  'Rename company': 'Cég átnevezése',

  // The last Admin
  'This is the last Admin': 'Ez az utolsó Admin',
  Continue: 'Folytatás',
  'This is the last Admin of a Company that has Devices. After this the Company keeps its Devices with nobody to administer them. The person stays, with no role.':
    'Ez egy olyan cég utolsó Adminja, amelynek vannak eszközei. Ezután a cég eszközei kezelő nélkül maradnak. Az ember megmarad, szerepkör nélkül.',

  // The states of a person
  'You have no access yet': 'Még nincs hozzáférésed',
  'Your sign-in is valid, but you have not been given a role in your company yet. Ask your company administrator to make you a Reader or an Administrator.':
    'A bejelentkezésed érvényes, de a cégedben még nem kaptál szerepkört. Kérd a cég adminisztrátorát, hogy tegyen Olvasóvá vagy Adminisztrátorrá.',
  'Your company is disabled': 'A céged le van tiltva',
  'Your company has been disabled, so nothing can be shown or changed until it is enabled again. Contact the platform administrator.':
    'A céged le lett tiltva, ezért addig semmi sem jeleníthető meg és nem módosítható, amíg újra nem engedélyezik. Fordulj a platform adminisztrátorhoz.',

  // Refusals of the API
  'Your Company is disabled.': 'A céged le van tiltva.',
  'You have no role in this Company yet. Ask a Company Admin or the platform administrator.': 'A cégben még nincs szerepköröd. Kérj a cég adminisztrátorától vagy a platform adminisztrátortól.',
  'This is the last Admin of a Company that has Devices: after this the Company keeps its Devices with nobody to administer them. Confirm to continue.':
    'Ez egy olyan cég utolsó Adminja, amelynek vannak eszközei: ezután a cég eszközei kezelő nélkül maradnak. A folytatáshoz erősítsd meg.',
  'This Company has Devices and no Admin, so its Users cannot be removed one by one: delete the Company first (or give it an Admin).':
    'Ennek a cégnek vannak eszközei, de nincs Adminja, ezért az emberei nem távolíthatók el egyenként: előbb töröld a céget (vagy adj neki Admint).',
  'Another Company already uses this name.': 'Másik cég már használja ezt a nevet.',
  'No such User.': 'Nincs ilyen ember.',
};
