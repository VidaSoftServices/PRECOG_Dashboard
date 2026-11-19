# Ollama jobs

How the Dashboard uses the API's asynchronous Ollama jobs: submit returns a Queued job, the Ollama Jobs page and the Issue summary card poll until a terminal status (`Succeeded`, not the documented `Completed`), cancel only while Queued, and the output is advisory text only. The API has no separate feature doc: its Ollama job persistence rules are in `VidaSoft.API/CLAUDE.md` ("TrainingRequest, ModelVersion, and Ollama job persistence"); the automatic Issue translation is in `languages.md` and the Issue e-mail in the API's `issue-email.md`.

Related: the API has no doc of its own for this feature (Dashboard-only doc).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

### Ollama

Fully asynchronous, at-least-once delivery — `Ollama_SubmitSummaryJob`
returns `202` immediately with a `Queued` job; `OllamaJobsPage.tsx` and the
Issue-detail summary card poll `GET /Jobs/{id}` on `POLL_INTERVALS_MS.activeJob`
until a **terminal** status. **The real terminal-success value is
`"Succeeded"`** — both `API_Integration_Guide.md` (§10) and the live
OpenAPI operation description say `"Completed"`, and both are wrong,
confirmed against the actual enum and controller source
(`Enums.OllamaJobStatus.Succeeded`, consumed via `.ToString()`). Polling
logic that checked for `"Completed"` would simply never stop — this is the
single highest silent-bug-risk item in the whole integration, called out
explicitly in `src/api/domainTypes.ts`'s `OllamaJobStatus` type and every
hook that consumes it.

Cancel only succeeds while still `Queued` — once a worker claims it,
`Cancel` returns `409` and the UI's only correct response is to keep
polling, not retry the cancel. Ollama output is advisory only: a category
suggestion requires Admin acceptance to become real; Ollama itself can never
review, classify, group, confirm, or train anything. User/DevicePrincipal
actor attribution exists on the job (`actorType`) but this frontend never
submits *as* a DevicePrincipal (backend explicitly excludes DevicePrincipal
from Ollama submission — `ActorType != User` → 401). Output is always
rendered as text (`resultText`), never raw HTML.
