import { createContext, useCallback, useContext, useEffect, useId, useMemo, type ReactNode } from 'react';
import { Toaster, useToastController, Toast, ToastTitle, ToastBody } from '@fluentui/react-components';
import { registerToastApi } from './toastBridge';

/**
 * One centralized Fluent Toast layer for the whole app. Call sites use
 * `useAppToast()` and never import Toaster/useToastController themselves -
 * this is the only place those are wired up, so every toast in the app
 * looks and behaves the same way (position, timeout, dismiss).
 *
 * A toast is for *event feedback* (save succeeded, job submitted, share
 * approved) - it never duplicates a field-level validation error, which
 * stays next to the field/form that produced it (see ErrorState/Field
 * usage throughout). A toast body is always a short, safe, human-written
 * string - never a raw response body, a token, a Device Secret, or
 * unfiltered Ollama output (see AGENTS.md's rendering rules, which apply
 * here exactly as everywhere else).
 */
interface AppToastApi {
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastApiContext = createContext<AppToastApi | null>(null);

export function AppToastProvider({ children }: { children: ReactNode }) {
  const toasterId = useId();
  const { dispatchToast } = useToastController(toasterId);

  const show = useCallback(
    (intent: 'success' | 'error' | 'info', message: string, title?: string) => {
      dispatchToast(
        <Toast>
          {title && <ToastTitle>{title}</ToastTitle>}
          <ToastBody>{message}</ToastBody>
        </Toast>,
        { intent, timeout: intent === 'error' ? 8000 : 4000 },
      );
    },
    [dispatchToast],
  );

  const api = useMemo<AppToastApi>(
    () => ({
      success: (message, title) => show('success', message, title),
      error: (message, title) => show('error', message, title),
      info: (message, title) => show('info', message, title),
    }),
    [show],
  );

  // Lets the module-level queryClient (which can't call hooks) surface
  // network-failure/rate-limit toasts through the same system - see
  // toastBridge.ts and queryClient.ts's global onError handlers.
  useEffect(() => {
    registerToastApi(api);
  }, [api]);

  return (
    <ToastApiContext.Provider value={api}>
      {children}
      <Toaster toasterId={toasterId} position="top-end" />
    </ToastApiContext.Provider>
  );
}

export function useAppToast(): AppToastApi {
  const ctx = useContext(ToastApiContext);
  if (!ctx) throw new Error('useAppToast must be used within an AppToastProvider');
  return ctx;
}
