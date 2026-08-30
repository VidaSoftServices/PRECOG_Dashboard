import type { paths } from './schema.generated';

/**
 * Every operation in the generated schema types `HMAC_Key` as a REQUIRED
 * call-site header parameter (Swashbuckle emitted it as an explicit header
 * parameter for the custom [ValidateHMAC] attribute, not just via
 * securitySchemes). It's actually injected centrally by the auth middleware
 * in client.ts, so requiring it at every one of ~104 call sites would be
 * exactly the duplication this rewrite's centralized API client exists to
 * avoid. schema.generated.ts itself must never be hand-edited (decision #2),
 * so this is a type-only, non-invasive patch applied on top of it: shallow
 * (path -> method only), leaves request/response body types untouched.
 */
type HttpMethod = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace';

type PatchOperation<Op> = Op extends { parameters: infer P }
  ? Omit<Op, 'parameters'> & {
      parameters: P extends { header: infer H } ? Omit<P, 'header'> & { header?: H } : P;
    }
  : Op;

export type AuthPatchedPaths = {
  [Path in keyof paths]: {
    [Method in keyof paths[Path]]: Method extends HttpMethod ? PatchOperation<paths[Path][Method]> : paths[Path][Method];
  };
};
