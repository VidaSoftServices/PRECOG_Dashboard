/**
 * Hand-authored supplemental types for response shapes the live OpenAPI document
 * does not schema (prose-only descriptions) or gets wrong. Each entry cites the
 * discrepancy it corrects — see the modernization audit for the source evidence.
 * Do not "fix" these to match swagger.json without re-verifying against
 * VidaSoft.API source, since swagger.json is the party that's wrong here.
 */

// --- D1: Authentication_RequestHMAC 200 response has no schema in swagger.json ---
export interface HmacKeyResponse {
  _HMAC_Key: string;
}

// --- Authentication_RequestDeviceToken 200 response has no schema in swagger.json ---
export interface DeviceTokenResponse {
  accessToken: string;
  expiresAt: string;
  expiresInSeconds: number;
  principalType: 'DevicePrincipal';
}

// D3 (User_GetUserDetails had no schema in swagger.json) is resolved as of the
// 2026-08-31 live-contract refresh: the operation now returns a real generated
// components['schemas']['CurrentUserDto'] (see AuthContext.tsx, which imports
// it directly from schema.generated.ts instead of a hand-typed shape here).

/**
 * D4: OllamaJobDto.status is typed as plain `string` in the generated schema,
 * and its own doc comment (copied from swagger.json) claims the terminal-success
 * value is "Completed". It is not. Confirmed against VidaSoft.API source
 * (Enums.OllamaJobStatus, OllamaController.cs) that the real wire value is
 * "Succeeded". Narrow to this type at the API boundary; never compare against
 * "Completed" for an Ollama job.
 */
export type OllamaJobStatus = 'Queued' | 'Processing' | 'Succeeded' | 'Failed' | 'Cancelled';

export type TrainingRequestStatus = 'Pending' | 'Claimed' | 'Processing' | 'Completed' | 'Failed' | 'Cancelled';

export type IssueReviewState = 'PendingReview' | 'ReviewedFault' | 'ReviewedFalsePositive';

export type KnowledgeShareStatus = 'Draft' | 'Approved' | 'Revoked';

export type CategorySuggestionStatus = 'Pending' | 'Suggested' | 'Accepted' | 'Rejected' | 'Failed';

export type ApplicationMode = 'continuous' | 'periodic';

export type SensorDirection = 'lowerisbetter' | 'higherisbetter' | 'bidirectional';

/**
 * D5: the four telemetry-ingestion POST 202 bodies (`List<MLOutput>`) are not
 * schema'd in swagger.json at all. Field shape was not recovered from source in
 * this pass - the ingestion response body is not currently consumed by any
 * planned UI (only the 202 status matters), so this is intentionally `unknown`
 * rather than guessed. Narrow it with a real type only after confirming the
 * shape from VidaSoft.API source, if a future feature needs to read it.
 */
export type TelemetryIngestAcceptedBody = unknown;
