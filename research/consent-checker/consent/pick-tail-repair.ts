// A torn last line can only come from an append that stopped part way, because each append writes one
// whole line with its newline. A torn line that parses lost only its newline; any other torn line
// goes, and the reservation before it stays unsettled.
export type TailRepair =
  | { kind: 'none' }
  | { kind: 'add_newline' }
  | { kind: 'cut'; keptBytes: number };

export function pickTailRepair(text: string): TailRepair {
  if (text === '' || text.endsWith('\n')) {
    return { kind: 'none' };
  }

  const tailStart = text.lastIndexOf('\n') + 1;

  if (isJSON(text.slice(tailStart))) {
    return { kind: 'add_newline' };
  }

  return { kind: 'cut', keptBytes: Buffer.byteLength(text.slice(0, tailStart)) };
}

function isJSON(text: string): boolean {
  try {
    JSON.parse(text);

    return true;
  } catch {
    return false;
  }
}
