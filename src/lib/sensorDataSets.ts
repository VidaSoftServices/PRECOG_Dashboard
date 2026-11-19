import {
  DIRECTIONS,
  FALSE_WORDS,
  MAX_IMPORT_ROWS,
  MAX_LENGTH,
  SCALES,
  TRUE_WORDS,
  type ImportCatalog,
} from '@/lib/sensorImport';
import { buildXlsx, type XlsxSheet } from '@/lib/xlsxWriter';

/**
 * The downloadable "Data sets" workbook: for every field of the Sensor import, the values a user may choose.
 *
 * Everything that comes from the API (units, aggregation types, known metrics) is taken from the catalog passed in -
 * nothing about units or aggregations is written here. The fixed vocabularies of the import itself (direction, scale,
 * the calculation switch) come from the importer's own constants, so this file can never list a value the importer
 * would reject.
 */

export const DATA_SETS_FILE_NAME = 'sensor-import-data-sets.xlsx';

const DIRECTION_MEANING: Record<(typeof DIRECTIONS)[number], string> = {
  lowerisbetter: 'A lower value is better; one target and tolerance (columns target, tolerance).',
  higherisbetter: 'A higher value is better; one target and tolerance (columns target, tolerance).',
  bidirectional: 'Deviation in either direction matters; targets and tolerances for both sides (targetAbove, targetBelow, toleranceAbove, toleranceBelow).',
};

function overviewRows(): (string | number)[][] {
  return [
    ['Field (template column)', 'Required?', 'What to enter', 'Choose from'],
    ['SensorName', 'Yes', `The Sensor's id on the Device (externalSensorId). Unique within the sheet, at most ${MAX_LENGTH.externalSensorId} characters. A Sensor named {machineName}_{point number} is a known metric and must carry that metric's exact unit.`, 'Free text; known metrics: sheet "Known metrics"'],
    ['DisplayName', 'No', `The Sensor's name, at most ${MAX_LENGTH.name} characters.`, 'Free text'],
    ['Direction', 'No (dialog default)', 'Which deviation of the value is bad.', 'Sheet "Direction"'],
    ['SensorType', 'No', `The kind of quantity measured, at most ${MAX_LENGTH.sensorType} characters.`, 'Free text'],
    ['UnitCode', 'Known metrics: yes', `The stable unit code (not the label), at most ${MAX_LENGTH.unitCode} characters.`, 'Sheet "UnitCode"'],
    ['RawScale', 'Yes (or the dialog default)', "The time unit of the raw policy's lookback.", 'Sheet "RawScale"'],
    ['RawLookback', 'Yes (or the dialog default)', 'Whole number greater than zero, counted in rawScale units.', 'Whole number > 0'],
    ['RawMinIssueScore', 'No (default 1)', 'The score a possible Issue must reach before it is a real Issue.', 'Whole number 0 - 32767'],
    ['Calculate', 'No (dialog default)', 'Calculate from this Sensor (true), or only store its data (false: no analysis, no Issue, and it is left out of the model).', 'Sheet "Calculate"'],
    ['Visible', 'No (dialog default)', 'Show this Sensor in Live Monitoring and Smart Analytics (true), or hide it there (false). Nothing else changes: the data is still stored, calculated and trained on, and an Issue that involves the Sensor still shows it.', 'Sheet "Visible"'],
    ['Target (optional)', 'No', 'Target of a lowerisbetter/higherisbetter Sensor. When any setpoint column is filled the Sensor gets a setpoint effective from the moment of the import; a one-sided Sensor then needs a target.', 'Any number (decimal comma allowed)'],
    ['Tolerance (optional)', 'No', 'Tolerance of a lowerisbetter/higherisbetter Sensor; needs target.', 'Number, 0 or more'],
    ['TargetAbove (optional)', 'No', 'Upper-side target of a bidirectional Sensor.', 'Any number'],
    ['TargetBelow (optional)', 'No', 'Lower-side target of a bidirectional Sensor.', 'Any number'],
    ['ToleranceAbove (optional)', 'No', 'Upper-side tolerance of a bidirectional Sensor; needs targetAbove.', 'Number, 0 or more'],
    ['ToleranceBelow (optional)', 'No', 'Lower-side tolerance of a bidirectional Sensor; needs targetBelow.', 'Number, 0 or more'],
    [],
    [`At most ${MAX_IMPORT_ROWS} Sensors per import. Header names are not case sensitive and may use spaces, underscores or dashes; a trailing "(optional)" is ignored.`],
  ];
}

/** Builds the workbook's sheets from the API catalog. */
export function buildDataSetsSheets(catalog: ImportCatalog): XlsxSheet[] {
  return [
    { name: 'Overview', rows: overviewRows(), columnWidths: [26, 24, 90, 44] },
    {
      name: 'Direction',
      rows: [['Value', 'Meaning'], ...DIRECTIONS.map((d) => [d, DIRECTION_MEANING[d]])],
      columnWidths: [20, 110],
    },
    {
      name: 'RawScale',
      rows: [['Value (time unit of rawLookback)'], ...SCALES.map((s) => [s])],
      columnWidths: [34],
    },
    {
      name: 'Calculate',
      rows: [
        ['Accepted values', 'Meaning'],
        ...TRUE_WORDS.map((w) => [w, 'Calculation on: new values are analysed and can raise Issues.']),
        ...FALSE_WORDS.map((w) => [w, 'Calculation off: data is still stored, but triggers no analysis and is left out of the model.']),
      ],
      columnWidths: [20, 90],
    },
    {
      name: 'Visible',
      rows: [
        ['Accepted values', 'Meaning'],
        ...TRUE_WORDS.map((w) => [w, 'Visible: shown in Live Monitoring and Smart Analytics.']),
        ...FALSE_WORDS.map((w) => [w, 'Hidden: left out of Live Monitoring and Smart Analytics. The data is still stored, calculated and trained on, and Issues that involve the Sensor still show it.']),
      ],
      columnWidths: [20, 110],
    },
    {
      name: 'UnitCode',
      rows: [['unitCode (enter this)', 'Label', 'Label (Hungarian)'], ...catalog.units.map((u) => [u.code, u.label, u.labelHu ?? ''])],
      columnWidths: [24, 34, 34],
    },
    {
      name: 'Known metrics',
      rows: [
        ['Machine name (sensorName = machine name + _ + point number, e.g. _1)', 'Display name', 'unitCode', 'Unit label'],
        ...catalog.metrics.map((m) => [m.machineName, m.displayName, m.unitCode, catalog.units.find((u) => u.code === m.unitCode)?.label ?? '']),
      ],
      columnWidths: [52, 44, 14, 26],
    },
  ];
}

/** The bytes of the "Data sets" .xlsx file. */
export function buildDataSetsWorkbook(catalog: ImportCatalog): Uint8Array {
  return buildXlsx(buildDataSetsSheets(catalog));
}
