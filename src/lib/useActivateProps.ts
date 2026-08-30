import type { KeyboardEvent, MouseEvent } from 'react';

/**
 * Spreads onto a non-native-interactive element (a Card or div used as a
 * click target) to make it keyboard-operable: Tab-focusable, and Enter/Space
 * activates it, matching native button semantics. Accessibility is not a
 * follow-up pass in this project (see AGENTS.md) - any click-to-navigate
 * row/card uses this instead of a bare `onClick`.
 */
export function activateProps(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      onActivate();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
