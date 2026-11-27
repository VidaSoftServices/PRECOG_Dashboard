# Indicator (Sensor) descriptions

The Dashboard side of Sensor descriptions: the Device page's Descriptions dialog (count, import, export, remove, templates, formatting legend), the English / Hungarian text areas of the Sensor Edit dialog, and the per-Sensor read of the enlarged chart and the Smart Analytics card. (This was a bullet of the "Two languages" section.)

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/descriptions.md](../../../PRECOG_API/docs/features/descriptions.md).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## Two languages: English and Hungarian (2026-11-19)

> One bullet of this CLAUDE.md section; the rest of it is in `languages.md`.

- **Descriptions** (stored by the API, `pg.sensordescriptions`; see the API's CLAUDE.md "Indicator descriptions"): the Device page's **Descriptions** button (Admin, `DescriptionsDialog`) shows how many texts are stored, **imports** a sheet (CSV or pasted cells; columns `sensorName`, `language` (EN/HU; no column = English) and `description`, one row per Sensor and language; matched to the Device's Sensors by `sensorName`, sent as `POST .../SensorDescriptions` by Sensor id), **exports** the stored texts as the same kind of sheet (`descriptions-device-{id}.csv`, importable again, `buildDescriptionSheet`), **removes** them all (acknowledgement checkbox), and offers the pump/fan templates and the formatting legend. One Sensor's two texts are also edited by hand in its **Edit** dialog (English and Hungarian text areas, markdown, 8000 characters; sent with `PUT .../Sensors/{id}/Descriptions` only when changed and only after the stored texts were read, so an unread text is never overwritten with a blank). The enlarged-chart tab and the Smart Analytics card read one Sensor's texts per request (`useSensorDescriptions`, only while the chart is open / the Sensor is selected, cached 5 minutes) in the chosen language, English where there is none; a Sensor without a description shows nothing. The old in-memory prototype store is gone.

- 2026-11-27 (the user's rule; replaces the 2026-11-25 "Device ID" version): every downloaded file about a Device ends with the Device's **name** after the number, e.g. `aggregation-device-1-Test_Device.csv`, `sensors-device-2-KS4.csv` (also setpoints, descriptions, the Sensor ID map and "Export sensor for hardware"). `deviceFilePart` (`src/lib/deviceFileName.ts`): letters (accented too), digits, `.`, `_`, `-` stay, anything else becomes `_`, at most 60 characters; an unnamed Device uses its Device ID. The two empty templates keep their fixed names.
- 2026-11-25: in the Descriptions dialog the template sentence stands on its own line and "Template: pump", "Template: fan" (and the formatting legend button) sit in one row below it.
