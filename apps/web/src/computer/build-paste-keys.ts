// The keysyms that type the text: a line break is Return, a tab is Tab, and any other control
// character is left out. A character in Latin-1 has the keysym of its code point, and any other has a
// Unicode keysym.
export function buildPasteKeys(text: string): number[] {
  const keysyms: number[] = [];

  // a string's iterator yields code points, and each code point is one keysym
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

// the number that RFC 6143 adds to the code point of a character outside Latin-1
const unicodeKeysymBase = 0x01_00_00_00;

function pickKeysym(character: string): number | null {
  const codePoint = character.codePointAt(0) ?? 0;

  if (character === '\n') {
    return returnKeysym;
  }

  if (character === '\t') {
    return tabKeysym;
  }

  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) {
    return null;
  }

  return codePoint < 0x1_00 ? codePoint : unicodeKeysymBase + codePoint;
}
