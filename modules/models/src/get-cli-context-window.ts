// This file copies how Claude Code 2.1.290, the CLI that the pinned Agent SDK ships, picks a model's
// context window: its model-ID canonicalizer, then its bundled catalog.

const nativeMillionModels = new Set([
  'claude-sonnet-5',
  'claude-sonnet-5-5',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-opus-5-5',
  'claude-fable-5',
  'claude-fable-5-1',
  'claude-mythos-5',
  'claude-mythos-5-1',
  'claude-mythos-preview',
]);

const millionWindow = 1_000_000;
const defaultWindow = 200_000;

export function getCLIContextWindow(model: string): number {
  if (/\[1m\]/iu.test(model)) {
    return millionWindow;
  }

  return nativeMillionModels.has(resolveCLIModelName(model)) ? millionWindow : defaultWindow;
}

const catalogModels = [
  'claude-3-5-haiku',
  'claude-haiku-4-5',
  'claude-3-5-sonnet',
  'claude-3-7-sonnet',
  'claude-sonnet-4-0',
  'claude-sonnet-4-5',
  'claude-sonnet-4-6',
  'claude-sonnet-5',
  'claude-sonnet-5-5',
  'claude-opus-4-0',
  'claude-opus-4-1',
  'claude-opus-4-5',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-opus-5-5',
  'claude-fable-5',
  'claude-fable-5-1',
  'claude-mythos-5',
  'claude-mythos-5-1',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
];

// The CLI tries these families in this order for an ID it cannot parse. The families it tries
// after them all have the smaller window, so the copy stops here.
const familyFallbacks = [
  ...[
    'claude-fable-5-1',
    'claude-fable-5',
    'claude-mythos-5-1',
    'claude-mythos-5',
    'claude-opus-5-5',
    'claude-opus-5',
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-opus-4-5',
    'claude-opus-4-1',
  ].map((model) => ({ model, pattern: new RegExp(model, 'u') })),
  { model: 'claude-opus-4-0', pattern: /claude-opus-4(?!-\d(?!\d))/u },
  ...['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5'].map(
    (model) => ({ model, pattern: new RegExp(model, 'u') }),
  ),
  { model: 'claude-sonnet-4-0', pattern: /claude-sonnet-4(?!-\d(?!\d))/u },
];

function resolveCLIModelName(model: string): string {
  const name = model.toLowerCase();
  const parsed = parseModelName(name);

  if (parsed !== null && !parsed.hasTrailer) {
    return (
      catalogModels.find((candidate) => isSameModel(parseModelName(candidate), parsed)) ?? name
    );
  }

  return (
    familyFallbacks.find((fallback) => fallback.pattern.test(name))?.model ??
    name.replace(/-\d{8}$/u, '')
  );
}

interface ParsedModelName {
  readonly family: string;
  readonly major: number;
  readonly minor: number;
  readonly isVersionFirst: boolean;

  readonly hasTrailer: boolean;
}

function parseModelName(name: string): ParsedModelName | null {
  const id = normalizeModelID(name.trim());

  if (id === null) {
    return null;
  }

  const familyFirst =
    /^claude-(?<family>[a-z]+)-(?<major>\d{1,2})(?!\d)(?:-(?<minor>\d{1,2})(?!\d))?/u.exec(id);

  const match =
    familyFirst ??
    /^claude-(?<major>\d{1,2})(?!\d)(?:-(?<minor>\d{1,2})(?!\d))?-(?<family>[a-z]+)/u.exec(id);

  if (match?.groups === undefined) {
    return null;
  }

  return buildParsedName(id.slice(match[0].length), match.groups, familyFirst === null);
}

const bedrockRegions = new Set(['us', 'eu', 'apac', 'jp', 'au', 'us-gov', 'global']);

function normalizeModelID(name: string): string | null {
  if (name === '' || /\s/u.test(name)) {
    return null;
  }

  const tagless = name.replace(/\[[12]m\]$/u, '');
  const id = tagless.slice(tagless.lastIndexOf('/') + 1);
  const prefixed = /^(?:(?<region>[a-z-]+)\.)?anthropic\.(?<model>claude-.*)$/u.exec(id);

  if (prefixed?.groups === undefined) {
    return id;
  }

  const region = prefixed.groups['region'];

  return region === undefined || bedrockRegions.has(region)
    ? (prefixed.groups['model'] ?? '')
    : null;
}

function buildParsedName(
  suffix: string,
  version: Readonly<Record<string, string | undefined>>,
  isVersionFirst: boolean,
): ParsedModelName | null {
  if (suffix !== '' && !/^[-@]/u.test(suffix)) {
    return null;
  }

  return {
    family: version['family'] ?? '',
    major: Number(version['major']),
    minor: Number(version['minor'] ?? 0),
    isVersionFirst,
    hasTrailer:
      !/^(?:-fast|-latest)?(?:-v\d{1,3}@\d{8}|[-@]\d{8})?(?:-v\d{1,3}(?::\d{1,3})?)?$/u.test(
        suffix,
      ),
  };
}

function isSameModel(candidate: ParsedModelName | null, parsed: ParsedModelName): boolean {
  return (
    candidate !== null &&
    candidate.family === parsed.family &&
    candidate.isVersionFirst === parsed.isVersionFirst &&
    candidate.major === parsed.major &&
    candidate.minor === parsed.minor
  );
}
