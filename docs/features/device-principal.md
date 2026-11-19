# DevicePrincipal ids next to the Secret

The three values a Device's firmware needs (Device id, DevicePrincipal id, Secret) and how the DevicePrincipal page shows the two ids, including the int64 precision limit. The one-time Secret and DevicePrincipal security rules stay in CLAUDE.md / AGENTS.md ("Authentication and security").

Related: the API has no doc of its own for this feature (Dashboard-only doc).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## DevicePrincipal ids next to the Secret

A Device's firmware needs three values: the Device id, the **DevicePrincipal id** and the Secret. `DevicePrincipalPage.tsx` therefore shows the **Principal ID** and **Device ID** (labelled read-only fields, each with its own Copy button) (a) permanently in the principal card, whenever a principal exists - nothing extra in the "Not provisioned" state - and (b) in the one-time "Device credential issued" dialog after Provision/Rotate, beside the Secret (from `ProvisionDevicePrincipalResponse.principalId` and the route's device id). The ids are **not secrets** and the Principal ID does not change on rotation; the one-time warning concerns the Secret only. The Secret itself is unchanged: local dialog state only, never cached, stored, logged or put in a URL.

The ids are shown as plain digits (`src/lib/ids.ts`, no locale formatting). The generated type is `number` and responses are read with `JSON.parse`, so an int64 id is exact only up to **2^53 - 1 = 9007199254740991**; a larger value has already been rounded before the UI sees it, so the page shows an explanatory error instead of wrong digits (`formatInt64Id`). Real DevicePrincipal ids are small identity values; carrying full int64 would need the HTTP client to parse such fields as strings - not done (no API/client contract change).
