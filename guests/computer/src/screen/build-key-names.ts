import type { Chord } from './types';

export type Keyboard = 'x' | 'browser';

const names: Readonly<Record<string, Readonly<Record<Keyboard, string>>>> = {
  enter: { x: 'Return', browser: 'Enter' },
  tab: { x: 'Tab', browser: 'Tab' },
  escape: { x: 'Escape', browser: 'Escape' },
  space: { x: 'space', browser: 'Space' },
  backspace: { x: 'BackSpace', browser: 'Backspace' },
  delete: { x: 'Delete', browser: 'Delete' },
  insert: { x: 'Insert', browser: 'Insert' },
  up: { x: 'Up', browser: 'ArrowUp' },
  down: { x: 'Down', browser: 'ArrowDown' },
  left: { x: 'Left', browser: 'ArrowLeft' },
  right: { x: 'Right', browser: 'ArrowRight' },
  home: { x: 'Home', browser: 'Home' },
  end: { x: 'End', browser: 'End' },
  pageup: { x: 'Prior', browser: 'PageUp' },
  pagedown: { x: 'Next', browser: 'PageDown' },
  ctrl: { x: 'ctrl', browser: 'Control' },
  alt: { x: 'alt', browser: 'Alt' },
  shift: { x: 'shift', browser: 'Shift' },
  super: { x: 'super', browser: 'Meta' },
};

// A chord in the notation of a keyboard: xdotool's `ctrl+shift+n`, `Return`, `F6`, or the
// browser's `Control+Shift+n`, `Enter`, `F6`
export function buildKeyNames(chord: Chord, keyboard: Keyboard): string {
  return chord.map((name) => names[name]?.[keyboard] ?? toFunctionKey(name)).join('+');
}

function toFunctionKey(name: string): string {
  return /^f\d+$/u.test(name) ? name.toUpperCase() : name;
}
