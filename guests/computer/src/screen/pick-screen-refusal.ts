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
  message:
    'The tab strip and window controls are off limits; use the browser tools (computer.browser_open, computer.browser_navigate, computer.browser_reload) instead',
};

const screenChanged: ComputerReply = {
  kind: 'failed',
  ok: false,
  reason: 'screen_changed',
  message:
    'the window under the act is not the one that was shown; take a screenshot and try again',
};

// Picks the refusal for a screen act on a target, or null when the act may run. The terminal, the
// browser's own controls and a browser window with no tracked tab belong to other tools. A bound act
// also refuses when its target differs from the binding on any field.
export function pickScreenRefusal(
  target: ScreenTarget,
  check: ScreenCheck,
  bound: ScreenBinding | null,
): ComputerReply | null {
  if (target.binding.kind === 'terminal') {
    return useRun;
  }

  if (bound !== null && !isSameWindow(target.binding, bound)) {
    return screenChanged;
  }

  if (isBrowserWithoutTab(target) || isBrowserControl(target, check)) {
    return useBrowserOpen;
  }

  return null;
}

function isSameWindow(current: ScreenBinding, bound: ScreenBinding): boolean {
  return (
    current.windowID === bound.windowID &&
    current.kind === bound.kind &&
    current.tab === bound.tab &&
    current.url === bound.url
  );
}

// A browser window that shows no tracked tab has no known page top, so a click or a key could land
// on its address bar. Opening the page with the browser tool makes it a tab the guest tracks.
function isBrowserWithoutTab(target: ScreenTarget): boolean {
  return target.binding.kind === 'browser' && target.binding.tab === undefined;
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
