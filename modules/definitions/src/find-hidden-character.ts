// The code points no reader sees, or that reorder the text a reader sees: control and format
// characters, tags and the variation selector supplement. The emoji variation selectors stay,
// because a warning sign uses one.
const hiddenRanges: readonly (readonly [number, number])[] = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
  [0xad, 0xad],
  [0x6_1c, 0x6_1c],
  [0x18_0e, 0x18_0e],
  [0x20_0b, 0x20_0f],
  [0x20_2a, 0x20_2e],
  [0x20_60, 0x20_64],
  [0x20_66, 0x20_6f],
  [0xfe_ff, 0xfe_ff],
  [0xff_f9, 0xff_fb],
  [0xe_00_00, 0xe_00_7f],
  [0xe_01_00, 0xe_01_ef],
];

// The first hidden or bidirectional control character in a text, with its line from 1 and its code
// point, such as U+202E for a right-to-left override, or null when the text holds none.
export function findHiddenCharacter(text: string): HiddenCharacter | null {
  let line = 1;

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (isHidden(codePoint)) {
      return { line, codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}` };
    }

    if (character === '\n') {
      line += 1;
    }
  }

  return null;
}

export interface HiddenCharacter {
  readonly line: number;
  readonly codePoint: string;
}

function isHidden(codePoint: number): boolean {
  return hiddenRanges.some(([first, last]) => codePoint >= first && codePoint <= last);
}
