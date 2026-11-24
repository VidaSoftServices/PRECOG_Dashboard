import { useMutation } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import type { components } from '@/api/schema.generated';

export type InvitationInfo = components['schemas']['InvitationInfoResponse'];

/**
 * The anonymous account endpoints behind the links of the invitation and password-reset e-mails. No session exists yet: the single-use token of the
 * link is the credential, so the calls carry no HMAC key. Every refusal on an unknown / used / expired token is the same 404; a rejected password is a
 * 400 whose text says why (an ApiError message, shown through t(): the known texts are translated).
 */
export function useInvitationInfo() {
  return useMutation({
    mutationFn: async (token: string) => unwrap(await apiClient.POST('/api/Accounts/Invitations/Info', { body: { token } })),
  });
}

export function useAcceptInvitation() {
  return useMutation({
    mutationFn: async (vars: { token: string; password: string; displayName?: string }) =>
      unwrap(await apiClient.POST('/api/Accounts/Invitations/Accept', { body: vars })),
  });
}

/** Always 204: the answer never says whether the address belongs to an account. */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: async (email: string) => unwrap(await apiClient.POST('/api/Accounts/PasswordReset/Request', { body: { email } })),
  });
}

export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: async (vars: { token: string; password: string }) =>
      unwrap(await apiClient.POST('/api/Accounts/PasswordReset/Confirm', { body: vars })),
  });
}
