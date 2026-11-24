const returnKeysym = 0xff_0d;
const tabKeysym = 0xff_09;
const unicodeKeysymBase = 0x01_00_00_00;

// The text a focused field gets from one key press, by the X11 keysym rules: Latin-1 keysyms are
// code points, keysyms from 0x01000000 are Unicode, Return ends the line, and others type nothing.
export function buildKeysymText(keysym: number): string {
  if (keysym === returnKeysym) {
    return '\n';
  }

  if (keysym === tabKeysym) {
    return '\t';
  }

  if (keysym >= unicodeKeysymBase) {
    return String.fromCodePoint(keysym - unicodeKeysymBase);
  }

  const isLatin1 = (keysym >= 0x20 && keysym < 0x7f) || (keysym >= 0xa0 && keysym < 0x1_00);

  return isLatin1 ? String.fromCodePoint(keysym) : '';
}
