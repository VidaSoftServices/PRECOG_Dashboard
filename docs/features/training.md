# Training, retraining and models

How the Training page and the model query present the API's training model: one model lineage per Device trained on its complete Sensor set, the TrainingRequest status life cycle and polling, coalescing by eligibility generation, the two servable pipeline versions, and why no ModelVersion history list exists.

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/training.md](../../../PRECOG_API/docs/features/training.md).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

### Training and models

One model lineage per Device — training and inference always use the
Device's **complete** current Sensor/aggregation-policy set, never only the
Sensor whose data triggered the request (`useCreateTrainingRequest`'s
optional `sensorIds` param is documented as non-narrowing for exactly this
reason). `TrainingRequestDto.status` moves
`Pending → Claimed → Processing → Completed/Failed/Cancelled`
(`TrainingPage.tsx` polls only while in one of the first three states, via
`POLL_INTERVALS_MS.activeJob`, and stops entirely at a terminal one).

Requests are identified by (target Device, requested eligibility
generation), never a time window — a Pending request coalesces onto the
newest generation; a Claimed/Processing request is never mutated, so exactly
one follow-up runs after it completes. `triggerReasons` is diagnostic-only
(why a Device retrained), never something this frontend treats as an input
to anything.

Pipeline v1 (label = Device-scoped `Issue.IssueKey`) and v2 (label =
globally-unique `Issue.Id`, required once cross-Device knowledge sharing
became trainable) are both fully servable; a stored `ModelVersion` is never
reinterpreted under the other pipeline's semantics. This frontend doesn't
need to branch on pipeline version anywhere — it only ever reads
`ModelVersionId`/`VersionNumber` as opaque identifiers.

Internal model blobs and storage paths are never exposed by the API and
therefore never appear in this frontend. **No ModelVersion list/detail
endpoint exists at all** (see "Missing backend capabilities" below) — the
Training page shows only what `TrainingRequestDto`/`ModelQueryResponse`
actually return, with an explicit in-page note that "previous versions"
browsing isn't currently possible, rather than a fabricated history list.
