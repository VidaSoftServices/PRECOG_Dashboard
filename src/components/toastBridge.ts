/**
 * `queryClient.ts` is a module-level singleton (created once, outside React)
 * so it can't call the `useAppToast()` hook directly. `AppToastProvider`
 * registers its API here on mount; the query client's global error handlers
 * read it from here to show a toast for cross-cutting failures (network
 * loss, 429) without every single query/mutation call site needing to know
 * about toasts. Same bridge pattern as `src/auth/authStore.ts`.
 */
export interface ToastLike {
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

let current: ToastLike | null = null;

export function registerToastApi(api: ToastLike): void {
  current = api;
}

export function getToastApi(): ToastLike | null {
  return current;
}
