import { isDeepStrictEqual } from 'node:util';

export interface RaisedManifest {
  readonly text: string;

  readonly previousFormat: number;
}

const formatLine = /^format:[ \t]*(?<format>\d+)[ \t]*(?<comment>#.*)?$/mu;

// nixie.yaml is the user's file, so the raise edits only the format line, and keeps its trailing
// comment, the line endings and every other line.
export function raiseManifestFormat(manifest: string, to: number): RaisedManifest {
  const isCRLF = manifest.includes('\r\n');
  const lines = isCRLF ? manifest.replaceAll('\r\n', '\n') : manifest;
  const format = formatLine.exec(lines);
  const previousFormat = Number(format?.groups?.['format'] ?? Number.NaN);

  if (format === null || !Number.isInteger(previousFormat)) {
    throw new Error(
      `nixie.yaml has no format line the export can read, so set \`format: ${String(to)}\` in it by hand`,
    );
  }

  if (previousFormat >= to) {
    return { text: manifest, previousFormat };
  }

  const raised = lines.replace(
    formatLine,
    [`format: ${String(to)}`, format.groups?.['comment']]
      .filter((part) => part !== undefined)
      .join(' '),
  );

  const text = isCRLF ? raised.replaceAll('\n', '\r\n') : raised;

  requireFormatOnly(manifest, text, to);

  return { text, previousFormat };
}

function requireFormatOnly(manifest: string, raised: string, to: number): void {
  const before = toMapping(Bun.YAML.parse(manifest));
  const after = toMapping(Bun.YAML.parse(raised));

  const isKept = Object.keys({ ...before, ...after })
    .filter((key) => key !== 'format')
    .every((key) => isDeepStrictEqual(before[key], after[key]));

  if (!isKept || after['format'] !== to) {
    throw new Error(
      `nixie.yaml has a layout the export cannot edit, so set \`format: ${String(to)}\` in it by hand`,
    );
  }
}

function toMapping(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
}
