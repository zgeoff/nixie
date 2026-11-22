import type { Chord } from './types';

const modifierOrder = ['ctrl', 'alt', 'shift', 'super'] as const;

const aliases: Readonly<Record<string, string>> = {
  control: 'ctrl',
  option: 'alt',
  meta: 'super',
  cmd: 'super',
  win: 'super',
  return: 'enter',
  esc: 'escape',
  del: 'delete',
  pgup: 'pageup',
  pgdn: 'pagedown',
};

// Reads one chord such as `ctrl+shift+n`, `enter` or `f6`, ignoring case, and orders its modifiers.
// A chord that names no key, two keys, or a key this reader does not know is null.
export function parseChord(text: string): Chord | null {
  const names = text
    .trim()
    .toLowerCase()
    .split('+')
    .map((name) => aliases[name.trim()] ?? name.trim());

  const key = names.at(-1);

  if (key === undefined || !isKey(key)) {
    return null;
  }

  const modifiers = names.slice(0, -1);

  if (
    !modifiers.every((name) => isModifier(name)) ||
    new Set(modifiers).size !== modifiers.length
  ) {
    return null;
  }

  const ordered = modifierOrder.filter((modifier) => modifiers.includes(modifier));

  return [...ordered, key];
}

const namedKeys = new Set([
  'enter',
  'tab',
  'escape',
  'space',
  'backspace',
  'delete',
  'insert',
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'pageup',
  'pagedown',
]);

const plainKey = /^(?:[a-z0-9]|f(?:[1-9]|1\d|2[0-4]))$/u;

function isKey(name: string): boolean {
  return namedKeys.has(name) || plainKey.test(name);
}

function isModifier(name: string): name is (typeof modifierOrder)[number] {
  return modifierOrder.some((modifier) => modifier === name);
}
