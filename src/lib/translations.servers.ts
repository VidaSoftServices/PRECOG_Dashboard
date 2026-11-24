/**
 * Hungarian texts of the Company servers (registry, Device id ranges, the Device's server), keyed by the English text. It also holds the refusals of the API
 * that the Servers tab and the Device page show (the API's texts are English; a text it sends is looked up here by t()).
 */
export const HU_SERVERS: Record<string, string> = {
  Servers: 'Szerverek',
  Server: 'Szerver',
  'Server:': 'Szerver:',
  'No server': 'Nincs szerver',
  'Add a server': 'Szerver hozzáadása',
  'Edit server': 'Szerver szerkesztése',
  'Delete server': 'Szerver törlése',
  'Server added': 'Szerver hozzáadva',
  'Server updated': 'Szerver frissítve',
  'Server deleted': 'Szerver törölve',
  'Device server updated': 'Az eszköz szervere frissítve',
  'This server': 'Ez a szerver',
  'No servers registered yet': 'Még nincs regisztrált szerver',
  Address: 'Cím',
  Port: 'Port',
  Notes: 'Megjegyzés',
  Connection: 'Kapcsolat',
  'Secure (https)': 'Biztonságos (https)',
  'Not secure (http)': 'Nem biztonságos (http)',
  'First Device id': 'Első eszközazonosító',
  'Last Device id': 'Utolsó eszközazonosító',
  'Host name, DNS name or IP address - without https://, port or path.': 'Gépnév, DNS-név vagy IP-cím – https://, port és elérési út nélkül.',
  'Optional: the range of Device ids only this server creates (both ends, 1 to 32767).': 'Nem kötelező: azon eszközazonosítók tartománya, amelyeket csak ez a szerver hoz létre (mindkét vége, 1 és 32767 között).',
  'Device ids {0} to {1}': '{0}. – {1}. eszközazonosító',
  'No reserved Device id range': 'Nincs fenntartott eszközazonosító-tartomány',
  '{0} Device(s)': '{0} eszköz',
  'A server with Devices cannot be deleted - move its Devices to another server first.': 'Eszközökkel rendelkező szerver nem törölhető – előbb helyezd át az eszközeit másik szerverre.',
  'Remove the server {0} from the registry? Nothing else changes.': 'Eltávolítod a(z) {0} szervert a nyilvántartásból? Más nem változik.',
  'A Company can run any number of PRECOG servers, each with its own database. Register them here so every Device can say which server it lives on; a reserved Device id range makes sure two servers never create the same Device id.':
    'Egy cég tetszőleges számú PRECOG szervert futtathat, mindegyik saját adatbázissal. Itt regisztrálhatod őket, hogy minden eszköz megmondhassa, melyik szerveren él; a fenntartott eszközazonosító-tartomány biztosítja, hogy két szerver sosem hoz létre azonos eszközazonosítót.',
  'The registered server of the Company this Device lives on. A server with a reserved Device id range only accepts Devices inside it.':
    'A cég regisztrált szervere, amelyen ez az eszköz él. A fenntartott eszközazonosító-tartománnyal rendelkező szerver csak a tartományon belüli eszközöket fogadja.',
  'Company profile, Locations, Device groups, the Device-class reference catalog and the Company servers.': 'Cégprofil, helyszínek, eszközcsoportok, az eszközosztályok katalógusa és a cég szerverei.',

  // Refusals of the API (and the same checks made in the form)
  'The name is required and at most 200 characters.': 'A név kötelező, legfeljebb 200 karakter.',
  'The address must be a host name, DNS name, IPv4 or IPv6 address, without scheme, port or path.': 'A cím gépnév, DNS-név, IPv4- vagy IPv6-cím lehet, séma, port és elérési út nélkül.',
  'The port must be between 1 and 65535.': 'A port 1 és 65535 között legyen.',
  'The notes are at most 1000 characters.': 'A megjegyzés legfeljebb 1000 karakter.',
  'The Device id range needs both ends, between 1 and 32767, the first not above the last.': 'Az eszközazonosító-tartományhoz mindkét vég kell, 1 és 32767 között, az első nem lehet nagyobb az utolsónál.',
  'A server with this name already exists.': 'Már van ilyen nevű szerver.',
  'The Device id range overlaps the range of the server {0} ({1}-{2}).': 'Az eszközazonosító-tartomány átfed a(z) {0} szerver tartományával ({1}–{2}).',
  'A Device assigned to this server has an id outside this range.': 'A szerverhez rendelt egyik eszköz azonosítója a tartományon kívül esik.',
  'Devices are still assigned to this server. Move them to another server first.': 'A szerverhez még vannak eszközök rendelve. Előbb helyezd át őket másik szerverre.',
  "The server does not exist in the caller's Company.": 'Ilyen szerver nincs a cégben.',
  'Device {0} is outside the Device id range of this server ({1}-{2}).': 'A(z) {0}. eszköz a szerver eszközazonosító-tartományán ({1}–{2}) kívül esik.',
  'A Company can have at most {0} servers.': 'Egy cégnek legfeljebb {0} szervere lehet.',
  'Something went wrong.': 'Valami hiba történt.',
  'The servers of your Company. They are registered by the platform administrator; each Device says on its own page which server it lives on.':
    'A cég szerverei. A platform adminisztrátor veszi fel őket; minden eszköz a saját oldalán mutatja, melyik szerveren él.',

  // Routing of a Device's requests to its own server
  'Some servers of your Company could not be read': 'A cég néhány szervere nem olvasható',
  '{0}: this address starts with http://, which the browser blocks from a page opened over https. Give the server an https address.':
    '{0}: ez a cím http://-vel kezdődik, amelyet a böngésző nem enged https-en megnyitott oldalról. Adj a szervernek https címet.',
  '{0}: the server did not accept your sign-in. The same user, with the same password, must exist on it.':
    '{0}: a szerver nem fogadta el a bejelentkezésedet. Ugyanennek a felhasználónak, ugyanazzal a jelszóval léteznie kell rajta.',
  '{0}: the server could not be reached. Its Devices are not shown.': '{0}: a szerver nem érhető el. Az eszközei nem láthatók.',
  'The server of this Device did not accept your sign-in. The same user, with the same password, must exist on that server.':
    'Az eszköz szervere nem fogadta el a bejelentkezésedet. Ugyanennek a felhasználónak, ugyanazzal a jelszóval léteznie kell azon a szerveren.',
  "This Issue belongs to a Device on another server. Open it from that Device's Issue list.":
    'Ez a probléma egy másik szerveren lévő eszközhöz tartozik. Nyisd meg az eszköz problémalistájából.',
};
