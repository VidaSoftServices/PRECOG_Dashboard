/** Hungarian texts of the maintenance history, the end-of-maintenance dialogs, the baselines and the chart markers (key = the English text). */
export const HU_MAINTENANCE: Record<string, string> = {
  // Chart markers
  'Blue dashed line: maintenance (long dashes: replacement / repair, short dashes: minor maintenance); light blue after a replacement: the warm-up, still measured against the previous baseline.':
    'Kék szaggatott vonal: karbantartás (hosszú szaggatás: csere / javítás, rövid: kisebb karbantartás); halványkék sáv csere után: a bejáratás, amikor a rendszer még az előző alapvonalhoz méri a mutatót.',
  Replacement: 'Csere',
  'Minor maintenance': 'Kisebb karbantartás',
  'New baseline': 'Új alapvonal',
  'warm-up': 'bejáratás',
  'new baseline': 'új alapvonal',
  'replacement / repair': 'csere / javítás',
  'minor maintenance': 'kisebb karbantartás',
  'Maintenance: {0}': 'Karbantartás: {0}',
  '{0} ({1})': '{0} ({1})',

  // Recalculation progress
  'Recalculating from the start': 'Újraszámolás az elejétől',
  'Deleting the calculated values': 'A számított értékek törlése',
  'Calculating the values not calculated yet': 'A még ki nem számolt értékek számolása',
  'Recalculating with the changed baseline': 'Újraszámolás a módosított alapvonallal',
  'Recalculation finished': 'Az újraszámolás befejeződött',
  'Calculated values deleted': 'A számított értékek törölve',
  'Calculation caught up': 'A számolás utolérte magát',
  'Recalculated with the changed baseline': 'Újraszámolva a módosított alapvonallal',

  // End of maintenance
  'Replacement / repair': 'Csere / javítás',
  'Replacement or repair - the machine’s normal state changed': 'Csere vagy javítás – megváltozott a gép normál állapota',
  'Minor maintenance - the normal state did not change': 'Kisebb karbantartás – a normál állapot nem változott',
  'In maintenance since {0}': 'Karbantartásban {0} óta',
  'End maintenance: {0}': 'Karbantartás lezárása: {0}',
  Next: 'Tovább',
  Back: 'Vissza',
  Kind: 'Típus',
  'What was done on the machine?': 'Mi történt a gépen?',
  'For example a bearing replaced, balancing, alignment. A new baseline starts: during a warm-up the readings are still measured against the old baseline (so a repair that went wrong shows), then only the readings after the maintenance count.':
    'Pl. csapágycsere, kiegyensúlyozás, beállítás. Új alapvonal indul: a bejáratás alatt a rendszer még a régi alaphoz méri a mutatót (így a rosszul sikerült javítás is jelez), utána csak a karbantartás utáni mérések számítanak.',
  'For example an inspection, lubrication or cleaning. The baseline stays; the charts only mark the maintenance with a blue dashed line.':
    'Pl. ellenőrzés, kenés, tisztítás. Az alapvonal marad, a diagramokon csak egy kék szaggatott vonal jelzi a karbantartást.',
  'Note (optional)': 'Megjegyzés (nem kötelező)',
  'Was it really a replacement or repair?': 'Biztosan csere vagy javítás volt?',
  'Was it really a minor maintenance?': 'Biztosan kisebb karbantartás volt?',
  'A new baseline starts now. During the warm-up (raw readings 1 day, hourly levels 3 days, daily 14 days, weekly 8 weeks, monthly 6 months) the readings are measured against the baseline before the maintenance, so a repair that went wrong raises an Issue. After it only the readings measured since the maintenance count, so a new fault shows early.':
    'Most új alapvonal indul. A bejáratás alatt (nyers mérések 1 nap, órás szintek 3 nap, napi 14 nap, heti 8 hét, havi 6 hónap) a rendszer a karbantartás előtti alapvonalhoz méri a mutatót, így a rosszul sikerült javítás problémát jelez. Utána csak a karbantartás óta mért értékek számítanak, így egy újonnan induló hiba korán látszik.',
  'The baseline stays: the readings are measured against the same normal state as before the maintenance. The charts mark the maintenance with a blue dashed line.':
    'Az alapvonal marad: a rendszer ugyanahhoz a normál állapothoz méri a mutatót, mint a karbantartás előtt. A diagramokon egy kék szaggatott vonal jelzi a karbantartást.',
  'If the kind turns out to be wrong, change it in the maintenance history: the Sensor is then recalculated from the end of this maintenance until now. Issues raised meanwhile are not deleted - you review them by hand.':
    'Ha kiderül, hogy rossz típust választottál, a karbantartási előzményekben módosíthatod: ekkor a szenzor a karbantartás végétől máig újraszámolódik. Az addig létrejött problémákat a rendszer nem törli, azokat kézzel nézed át.',
  'I understand: this changes the baseline the Sensor is measured against.': 'Értem: ez megváltoztatja, mihez méri a rendszer a szenzort.',
  'I understand: the baseline of the Sensor stays as it is.': 'Értem: a szenzor alapvonala nem változik.',
  'A new baseline starts now for every one of these Sensors: during the warm-up the readings are still measured against the baseline before the maintenance, then only the readings since the maintenance count.':
    'Mindegyik szenzornál új alapvonal indul: a bejáratás alatt a rendszer még a karbantartás előtti alapvonalhoz méri a mutatót, utána csak a karbantartás óta mért értékek számítanak.',
  'The baseline stays; the charts only mark the maintenance with a blue dashed line.': 'Az alapvonal marad, a diagramokon csak egy kék szaggatott vonal jelzi a karbantartást.',
  'The kind can be changed later in the maintenance history (the Sensor is then recalculated from the end of the maintenance).':
    'A típus később a karbantartási előzményekben módosítható (ekkor a szenzor a karbantartás végétől újraszámolódik).',
  'I understand: this changes the baseline the Sensors are measured against.': 'Értem: ez megváltoztatja, mihez méri a rendszer a szenzorokat.',
  'I understand: the baseline of the Sensors stays as it is.': 'Értem: a szenzorok alapvonala nem változik.',

  // The Maintenance page of a Device
  '{0} of {1} Sensor(s) of this Device are in maintenance mode now.': '{1} szenzorból {0} van most karbantartás módban ezen az eszközön.',
  'While a Sensor is in maintenance, the values the Device sends for it are accepted but ignored: they are not stored and not analysed.':
    'Amíg egy szenzor karbantartás módban van, az eszköz által küldött értékeit a rendszer elfogadja, de figyelmen kívül hagyja: nem tárolja és nem elemzi őket.',
  'Start maintenance on all Sensors': 'Karbantartás indítása minden szenzoron',
  'End maintenance on all Sensors': 'Karbantartás lezárása minden szenzoron',
  'Start or end on all Sensors…': 'Indítás vagy lezárás minden szenzoron…',
  // Maintenance history
  'Maintenance history': 'Karbantartási előzmények',
  'Sensor of the maintenance history': 'A karbantartási előzmények szenzora',
  'All Sensors': 'Minden szenzor',
  'All Sensors ({0})': 'Minden szenzor ({0})',
  'Start a new baseline…': 'Új alapvonal indítása…',
  'Loading the maintenance history…': 'A karbantartási előzmények betöltése…',
  'No maintenance has been recorded on this Device yet.': 'Ennél az eszköznél még nincs rögzített karbantartás.',
  'No maintenance has been recorded on this Sensor yet.': 'Ennél a szenzornál még nincs rögzített karbantartás.',
  'Start → end': 'Kezdete → vége',
  Baseline: 'Alapvonal',
  Actions: 'Műveletek',
  'still in maintenance': 'még karbantartásban',
  'In maintenance': 'Karbantartásban',
  'New baseline (by hand)': 'Új alapvonal (kézzel)',
  'Warm-up': 'Bejáratás',
  'raw readings until {0}, measured against the previous baseline': 'nyers mérések {0}-ig, az előző alapvonalhoz mérve',
  'Current baseline': 'Aktuális alapvonal',
  'Earlier baseline': 'Korábbi alapvonal',
  unchanged: 'nem változott',
  'changed {0}': 'módosítva: {0}',
  'Change kind': 'Típus módosítása',
  'Show 20 more ({0} more)': 'Még 20 megjelenítése (még {0})',
  'Any finished maintenance can be changed, however far back. Changing its kind recalculates the Sensor from the end of that maintenance until now (later baselines too; their kind stays). Issues raised meanwhile are not deleted - review them by hand.':
    'Bármelyik lezárt karbantartás módosítható, akármilyen régi. A típus módosítása a karbantartás végétől máig újraszámolja a szenzort (a későbbi alapvonalakat is; azok típusa nem változik). Az addig létrejött problémákat a rendszer nem törli – nézd át őket kézzel.',

  // Kind change
  'Kind changed to {0}; {1} is being recalculated from {2}.': 'Típus módosítva: {0}; a(z) {1} újraszámolása folyik {2}-tól.',
  'Kind changed to {0}.': 'Típus módosítva: {0}.',
  'Change the kind of the maintenance': 'A karbantartás típusának módosítása',
  'Change and recalculate': 'Módosítás és újraszámolás',
  Now: 'Most',
  'New kind': 'Új típus',
  'Working out what is recalculated…': 'Annak kiszámolása, mi számolódik újra…',
  Recalculated: 'Újraszámolva',
  '{0} → now': '{0} → most',
  'Raw readings': 'Nyers mérések',
  '{0} reading(s), analysed again in the background': '{0} mérés, újraelemzés a háttérben',
  'Aggregation levels': 'Aggregációs szintek',
  'none with calculation on': 'nincs bekapcsolt számolású',
  'Later baselines': 'Későbbi alapvonalak',
  '{0} - recalculated too, their kind stays': '{0} – ezek is újraszámolódnak, a típusuk marad',
  'No Issue of this Sensor lies in the recalculated span.': 'Az újraszámolt időszakban ennek a szenzornak nincs problémája.',
  '{0} Issue(s) lie in the recalculated span. They are not deleted and not raised again: review them, and delete the ones the old baseline caused.':
    '{0} probléma esik az újraszámolt időszakba. A rendszer nem törli és nem hozza létre újra őket: nézd át, és töröld azokat, amelyeket a régi alapvonal okozott.',
  'I understand: everything of this Sensor from this maintenance on is recalculated.': 'Értem: ennek a szenzornak minden adata újraszámolódik ettől a karbantartástól kezdve.',

  // Baseline by hand
  'New baseline started for {0} Sensor(s); {1} in maintenance left out.': 'Új alapvonal indult {0} szenzornál; {1} karbantartásban lévő kimaradt.',
  'New baseline started for {0} Sensor(s).': 'Új alapvonal indult {0} szenzornál.',
  'Start a new baseline': 'Új alapvonal indítása',
  'Start the new baseline': 'Az új alapvonal indítása',
  'For a change of the machine’s normal state that needed no maintenance mode (moved, process changed). Exactly as after a replacement: during the warm-up the readings are measured against the previous baseline, then only the readings since this instant count.':
    'Olyan változáshoz a gép normál állapotában, amelyhez nem kellett karbantartási mód (áthelyezés, folyamatváltozás). Pontosan úgy működik, mint csere után: a bejáratás alatt a rendszer az előző alapvonalhoz méri a mutatót, utána csak az ettől az időponttól mért értékek számítanak.',
  'Starts at': 'Kezdete',
  'Choose an instant.': 'Válassz időpontot.',
  'The instant may not be in the future.': 'Az időpont nem lehet a jövőben.',
  'The instant lies in the past: the Sensors are recalculated from there until now. Issues raised meanwhile are not deleted - review them by hand.':
    'Az időpont a múltban van: a szenzorok onnan máig újraszámolódnak. Az addig létrejött problémákat a rendszer nem törli – nézd át őket kézzel.',

  // Permanent deletion of aggregation levels
  'Delete {0} level(s)…': '{0} szint törlése…',
  'Delete for {0} Sensor(s)…': 'Törlés {0} szenzornál…',
  'Delete the level permanently': 'A szint végleges törlése',
  'Delete from CSV': 'Törlés CSV-ből',
  'One row per level to delete:': 'Egy sor egy törlendő szint:',
  'Only SensorName, TimeScale and AggregationFunction are read, so an aggregation sheet or an export works as it is. The levels are deleted PERMANENTLY with their values and their Issues; the next step shows what goes and asks for a confirmation.': 'Csak a SensorName, a TimeScale és az AggregationFunction oszlopot olvassa, így egy aggregációs lap vagy egy export is jó úgy, ahogy van. A szintek az értékeikkel és a problémáikkal együtt VÉGLEG törlődnek; a következő lépés megmutatja, mi törlődik, és megerősítést kér.',
  '{0} level(s) to delete permanently.': '{0} szint végleges törlése.',
  'Deletes the level PERMANENTLY for every chosen Sensor that has it: its values and the Issues it raised go too. The next step shows what goes and asks for a confirmation. The raw level cannot be deleted.': 'VÉGLEG törli a szintet minden kiválasztott szenzornál, amelyiknek van ilyen: az értékei és az általa nyitott problémák is törlődnek. A következő lépés megmutatja, mi törlődik, és megerősítést kér. A nyers szint nem törölhető.',
  'Delete aggregation levels permanently?': 'Végleg törlöd az aggregációs szinteket?',
  '{0} aggregation level(s) deleted with {1} bucket(s) and {2} Issue(s).': '{0} aggregációs szint törölve, {1} vödörrel és {2} problémával.',
  'Retraining was scheduled (reviewed Issues were deleted).': 'Újratanítás ütemezve (felülvizsgált problémák is törlődtek).',
  'Delete {0} level(s) permanently': '{0} szint végleges törlése',
  'Delete permanently': 'Végleges törlés',
  'Working out what is deleted…': 'Annak kiszámolása, mi törlődik…',
  'Levels deleted': 'Törlendő szintek',
  'Aggregated buckets': 'Aggregált vödrök',
  'Issues of these levels': 'E szintek problémái',
  '{0} (of them reviewed: {1})': '{0} (ebből felülvizsgált: {1})',
  'Not deleted': 'Nem törlődik',
  'This cannot be undone.': 'Ez nem vonható vissza.',
  'The levels, every aggregated value of them and every Issue they raised are deleted for good. The raw readings and the raw level stay; a level can be created again later (its history is then aggregated afresh, without the old Issues).': 'A szintek, minden aggregált értékük és minden általuk nyitott probléma végleg törlődik. A nyers mérések és a nyers szint maradnak; egy szint később újra létrehozható (az előzményei akkor újra aggregálódnak, a régi problémák nélkül).',
  'Reviewed Issues are training examples: deleting them schedules retraining of the Device.': 'A felülvizsgált problémák tanítópéldák: a törlésük az eszköz újratanítását ütemezi.',
  '…and {0} more.': '…és még {0}.',
  'I understand: the levels, their values and their Issues are deleted permanently.': 'Értem: a szintek, az értékeik és a problémáik végleg törlődnek.',
  'Delete permanently…': 'Végleges törlés…',
  'Delete the {0} level permanently?': 'Végleg törlöd a(z) {0} szintet?',
};
