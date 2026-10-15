// Mirrors how Claude Code 2.1.290, the CLI the pinned Agent SDK ships, picks a model's context window
// when nothing overrides it: its model-ID canonicalizer, then its bundled catalog.

// the models the CLI's catalog marks with a native window of a million tokens, plus the preview
// model the CLI names on its own
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

// the window the CLI assumes for every other model, whatever the model API allows
const defaultWindow = 200_000;

// The context window, in tokens, the Claude CLI assumes for a model, which with auto-compaction off
// is the only limit it refuses a call against. A model the copy misses gets the smaller window, so
// a check against it errs toward a refusal.
export function getCLIContextWindow(model: string): number {
  if (/\[1m\]/iu.test(model)) {
    return millionWindow;
  }

  return nativeMillionModels.has(resolveCLIModelName(model)) ? millionWindow : defaultWindow;
}

interface ParsedModelName {
  readonly family: string;
  readonly major: number;
  readonly minor: number;
  readonly isVersionFirst: boolean;

  // whether the text after the version is anything but a date, a version tag or -fast or -latest
  readonly hasTrailer: boolean;
}

// every model in the CLI's catalog, and the legacy models it knows beside them
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

// the CLI's fallback for an ID it cannot parse, in its order: the first family the text contains.
// The families it tries after these are all smaller-window models, so the copy stops here.
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

// The CLI's canonical name for a model ID: a parsed ID that matches a catalog model takes that
// model's name, and any other ID falls back to the first catalog family its text contains.
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

// the regions a Bedrock ID may lead with
const bedrockRegions = new Set(['us', 'eu', 'apac', 'jp', 'au', 'us-gov', 'global']);

// Parses an ID the way the CLI does: the text after the last slash, with any region and anthropic
// prefix and any [1m] or [2m] tag removed, read as a family and a version.
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
