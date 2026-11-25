// The keysyms that type the text: a line break is Return, a tab is Tab, and a printable ASCII
// character has the keysym of its code point. Any other character is left out, because Chromium
// does not yet carry the upstream keymap fix that a typed key outside ASCII needs.
export function buildPasteKeys(text: string): number[] {
  const keysyms: number[] = [];

  for (const character of text.replaceAll(/\r\n?/gu, '\n')) {
    const keysym = pickKeysym(character);

    if (keysym !== null) {
      keysyms.push(keysym);
    }
  }

  return keysyms;
}

const returnKeysym = 0xff_0d;
const tabKeysym = 0xff_09;

function pickKeysym(character: string): number | null {
  const codePoint = character.codePointAt(0) ?? 0;

  if (character === '\n') {
    return returnKeysym;
  }

  if (character === '\t') {
    return tabKeysym;
  }

  return codePoint >= 0x20 && codePoint < 0x7f ? codePoint : null;
}
