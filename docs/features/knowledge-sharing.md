# Knowledge sharing between Devices

The Knowledge Sharing page flow, mirroring the backend: inspect compatibility, create a Draft, approve with 100 % target coverage, add / remove the transferred canonical reviewed Issues; Device classes are context only, never compatibility proof; the target always trains its own model.

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/knowledge-sharing.md](../../../PRECOG_API/docs/features/knowledge-sharing.md).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

### Knowledge sharing

Explicit, same-Company by default, Admin-approved, versioned per
source→target Device pair. `KnowledgeSharingPage.tsx`'s flow mirrors the
backend exactly: `GET Compatibility` (inspect before creating) → `POST /`
(Draft) → `POST {id}/Approve` (requires 100% target-position coverage,
enforced client-side as a running count before the button even enables,
mirroring the server's own hard requirement) → `POST {id}/Issues`/
`DELETE {id}/Issues` (select which canonical, reviewed source Issues
actually transfer — never `PendingReview` — and remove one already
included; the per-Issue chip toggles between the two based on current
state, a real bug fixed after direct testing found it previously always
called the add path regardless, making removal a silent no-op).
`DeviceClassDto`/`DeviceClassMapping` are shown as
informational context only (never as compatibility proof — "Sensor names
and IDs alone are insufficient," backend `CLAUDE.md`); every compatibility
claim in the UI traces to a live `StreamCompatibilityDto.compatible`/
`failures[]` field, never an inference from display names. The target
Device always gets its **own** new `TrainingRequest`/`ModelVersion` — a
share never copies model bytes or an active-model reference.

Two-Device comparison in Smart Analytics is a read-only visualization —
it never itself approves a share, remaps a Sensor, classifies an Issue,
groups Issues, or triggers training; it only offers an Admin-only link
*into* the separate Knowledge Sharing workflow with the two Devices
prefilled.
