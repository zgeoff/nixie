import type { ComputerReply, ScreenBinding } from '@heynixie/wire';
import type { Chord, ScreenTarget } from './types';

// The act a refusal check reads: the point of a click or a scroll, or the chord a type presses. A
// type of plain text has no chord.
export type ScreenCheck =
  | { readonly kind: 'click'; readonly y: number }
  | { readonly kind: 'scroll' }
  | { readonly kind: 'text' }
  | { readonly kind: 'chord'; readonly chord: Chord };

const useRun: ComputerReply = {
  kind: 'failed',
  ok: false,
  reason: 'use_run',
  message: 'Use the computer.run tool instead',
};

const useBrowserOpen: ComputerReply = {
  kind: 'failed',
  ok: false,
  reason: 'use_browser_open',
  message: 'Use the computer.browser_open tool instead',
};

const screenChanged: ComputerReply = {
  kind: 'failed',
  ok: false,
  reason: 'screen_changed',
  message:
    'the window under the act is not the one that was shown; take a screenshot and try again',
};

// Picks the refusal for a screen act on a target, or null when the act may run. The terminal and the
// browser's own controls belong to computer.run and computer.browser_open. A bound act also refuses
// when its target differs from the binding on any field.
export function pickScreenRefusal(
  target: ScreenTarget,
  check: ScreenCheck,
  bound: ScreenBinding | null,
): ComputerReply | null {
  if (target.binding.kind === 'terminal') {
    return useRun;
  }

  if (isBrowserControl(target, check)) {
    return useBrowserOpen;
  }

  if (bound !== null && !isSameWindow(target.binding, bound)) {
    return screenChanged;
  }

  return null;
}

// chords that move focus to the address bar or open a new window or tab
const browserChords = new Set([
  'ctrl+l',
  'alt+d',
  'f6',
  'ctrl+k',
  'ctrl+e',
  'ctrl+t',
  'ctrl+n',
  'ctrl+shift+n',
]);

function isBrowserControl(target: ScreenTarget, check: ScreenCheck): boolean {
  if (target.binding.kind !== 'browser') {
    return false;
  }

  if (check.kind === 'click') {
    return target.pageTop !== null && check.y < target.pageTop;
  }

  return check.kind === 'chord' && browserChords.has(check.chord.join('+'));
}

function isSameWindow(current: ScreenBinding, bound: ScreenBinding): boolean {
  return (
    current.windowID === bound.windowID &&
    current.kind === bound.kind &&
    current.tab === bound.tab &&
    current.url === bound.url
  );
}
