// the terminal's height, in lines
const visibleLines = 32;
const escape = String.fromCodePoint(0x1b);
const bell = String.fromCodePoint(7);

// A CSI sequence, an OSC sequence that ends with a bell or ST, and a two-byte sequence
const escapePattern = new RegExp(
  `${escape}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${bell}${escape}]*(?:${bell}|${escape}\\\\)|[@-Z\\\\-_])`,
  'gu',
);

// A sequence that wipes the screen: erase all or erase with scrollback, a full reset, and the home
// then erase below that `clear` prints
const resetPattern = new RegExp(`${escape}(?:\\[[23]J|c|\\[(?:1;1)?H${escape}\\[0?J)`, 'gu');

// The last lines that a terminal's log shows: what a clear or a reset wiped gone, its escape
// sequences gone, a carriage return taking the line back to its start, and a backspace taking a
// character off.
export function toTerminalLines(raw: string): string {
  const resets = [...raw.matchAll(resetPattern)];
  const lastReset = resets.at(-1);
  const shown = lastReset === undefined ? raw : raw.slice(lastReset.index + lastReset[0].length);
  const text = shown.replaceAll(escapePattern, '');
  const lines: string[] = [];
  let line: string[] = [];
  let column = 0;

  for (const character of text) {
    if (character === '\n') {
      lines.push(line.join(''));

      line = [];
      column = 0;
    } else if (character === '\r') {
      column = 0;
    } else if (character === '\b') {
      column = Math.max(0, column - 1);
    } else if (character >= ' ' || character === '\t') {
      line[column] = character;
      column += 1;
    }
  }

  lines.push(line.join(''));

  return lines
    .slice(-visibleLines)
    .map((entry) => entry.trimEnd())
    .join('\n')
    .trimEnd();
}
