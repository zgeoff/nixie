const returnKeysym = 0xff_0d;
const tabKeysym = 0xff_09;

// the number that RFC 6143 adds to the code point of a character outside Latin-1
const unicodeKeysymBase = 0x01_00_00_00;

// The keysyms that type the text: a line break is Return, a tab is Tab, and any other control
// character is left out. A character in Latin-1 has the keysym of its code point, and any other has a
// Unicode keysym.
export function buildPasteKeys(text: string): number[] {
  return [...text.replaceAll(/\r\n?/gu, '\n')].flatMap((character) => {
    const codePoint = character.codePointAt(0) ?? 0;

    if (character === '\n') {
      return [returnKeysym];
    }

    if (character === '\t') {
      return [tabKeysym];
    }

    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) {
      return [];
    }

    return [codePoint < 0x1_00 ? codePoint : unicodeKeysymBase + codePoint];
  });
}
