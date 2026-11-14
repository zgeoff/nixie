export interface TextRange {
  readonly start: number;
  readonly end: number;
}

export function collectQuotedBlocks(text: string): readonly TextRange[] {
  const lines = collectLines(text);
  const fences = collectFences(lines, text.length);

  const outside = lines.filter(
    (line) => !fences.some((fence) => fence.start <= line.start && line.start < fence.end),
  );

  const header = outside.find((line) => isReplyHeader(line.trimmed));
  const cut = header?.start ?? text.length;
  const quotes = outside.filter((line) => line.trimmed.startsWith('>') && line.start < cut);

  const blocks = [
    ...fences.filter((fence) => fence.start < cut),
    ...quotes.map((line) => ({ start: line.start, end: line.end })),
  ].toSorted((left, right) => left.start - right.start);

  return header === undefined ? blocks : [...blocks, { start: header.start, end: text.length }];
}

interface Line extends TextRange {
  readonly trimmed: string;
}

function collectLines(text: string): readonly Line[] {
  let offset = 0;

  return text.split('\n').map((line) => {
    const start = offset;

    offset += line.length + 1;

    return { start, end: start + line.length, trimmed: line.trimStart() };
  });
}

interface OpenFence {
  readonly start: number;
  readonly run: string;
}

// CommonMark closes a fence on a run of its opening character at least as long as the opening run,
// with nothing after it, and an unclosed fence runs to the end of the message.
function collectFences(lines: readonly Line[], length: number): readonly TextRange[] {
  const fences: TextRange[] = [];
  let open: OpenFence | null = null;

  for (const line of lines) {
    const run = /^(?:`{3,}|~{3,})/u.exec(line.trimmed)?.[0];

    if (open === null && run !== undefined) {
      open = { start: line.start, run };
    } else if (open !== null && run !== undefined && isClosingFence(line.trimmed, open.run)) {
      fences.push({ start: open.start, end: line.end });

      open = null;
    }
  }

  return open === null ? fences : [...fences, { start: open.start, end: length }];
}

function isClosingFence(trimmed: string, opening: string): boolean {
  const closing = /^(?<run>`+|~+)\s*$/u.exec(trimmed)?.groups?.['run'];

  return closing !== undefined && closing.startsWith(opening);
}

function isReplyHeader(line: string): boolean {
  return (
    /^On .{3,200} wrote:\s*$/u.test(line) ||
    /^-{2,}\s*(?:Forwarded|Original) message\s*-{2,}/iu.test(line) ||
    /^From: .+/u.test(line)
  );
}
