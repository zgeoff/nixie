import type { SkillFrontmatter } from '@heynixie/definitions';
import type { DestinationToken } from '@heynixie/memory';
import { collectDestinationTokens } from '@heynixie/memory';
import type { CheckerAnswer } from '@heynixie/sessions';
import { match } from 'ts-pattern';
import type { ScriptCommand } from './collect-script-commands';
import { collectScriptCommands } from './collect-script-commands';
import type { CommitSignature } from './read-github-skill';

export interface SkillVendorReport {
  readonly files: ReadonlyMap<string, string>;
  readonly frontmatter: SkillFrontmatter;
  readonly signature: CommitSignature;
  readonly skipped: readonly string[];

  readonly review: CheckerAnswer | null;
}

export function renderSkillVendorReport(report: SkillVendorReport): string {
  const tokens = collectTokenFindings(report.files).map((finding) => renderTokenFinding(finding));
  const commands = collectScriptCommands(report.files).map((command) => renderCommand(command));

  const sections = [
    '## Review report',
    "nixie built this report in code from the skill's files. It points at what to read; it approves nothing, and only your merge lets the skill in.",
    '### Destination-like tokens',
    renderList(tokens, 'None found.'),
    '### Commands that install a package or reach the network',
    renderList(commands, 'None found.'),
    '### Fields the skill declares',
    renderFields(report.frontmatter),
    ...renderSignature(report.signature),
    ...renderSkipped(report.skipped),
    ...renderReview(report.review),
  ];

  return sections.join('\n\n');
}

interface TokenFinding {
  readonly token: DestinationToken;
  readonly places: readonly string[];
}

function collectTokenFindings(files: ReadonlyMap<string, string>): readonly TokenFinding[] {
  const fileNames = new Set(
    [...files.keys()].flatMap((path) => [
      path.toLowerCase(),
      (path.split('/').pop() ?? '').toLowerCase(),
    ]),
  );

  const found = new Map<string, { token: DestinationToken; places: string[] }>();

  for (const [path, text] of files) {
    for (const [index, line] of text.split('\n').entries()) {
      for (const token of collectDestinationTokens(line)) {
        if (token.kind === 'domain' && fileNames.has(token.key)) {
          continue;
        }

        const key = `${token.kind}\0${token.key}`;
        const entry = found.get(key) ?? { token, places: [] };

        entry.places.push(`${path}:${String(index + 1)}`);
        found.set(key, entry);
      }
    }
  }

  return [...found.values()];
}

function renderTokenFinding(finding: TokenFinding): string {
  const shown = finding.places.slice(0, 3).map((place) => renderCode(place));
  const more = finding.places.length - shown.length;
  const places = more > 0 ? `${shown.join(', ')} and ${String(more)} more` : shown.join(', ');

  return `- ${finding.token.kind} ${renderCode(finding.token.raw)} at ${places}`;
}

// The fence takes one more backtick than the longest run in the text, so no text can close it and
// add markdown, a link or a mention to the body.
function renderCode(text: string): string {
  const flat = text.replaceAll(/[\r\n]+/gu, ' ');
  const longest = Math.max(0, ...[...flat.matchAll(/`+/gu)].map((run) => run[0].length));
  const fence = '`'.repeat(longest + 1);
  const padded = flat.startsWith('`') || flat.endsWith('`') ? ` ${flat} ` : flat;

  return `${fence}${padded}${fence}`;
}

function renderCommand(command: ScriptCommand): string {
  const label = command.kind === 'install' ? 'installs' : 'reaches the network';

  return `- ${renderCode(`${command.path}:${String(command.line)}`)} ${label}: ${renderCode(command.text)}`;
}

// GitHub caps a pull request body at 65,536 characters, so each list stops well short of it.
const maxListItems = 50;

function renderList(items: readonly string[], empty: string): string {
  if (items.length === 0) {
    return empty;
  }

  const shown = items.slice(0, maxListItems);
  const more = items.length - shown.length;

  return more > 0 ? [...shown, `- and ${String(more)} more`].join('\n') : shown.join('\n');
}

function renderFields(frontmatter: SkillFrontmatter): string {
  const allowed = frontmatter.allowedTools;
  const compatibility = frontmatter.compatibility;

  return [
    allowed === null
      ? '- `allowed-tools`: not set'
      : `- \`allowed-tools\`: ${renderCode(allowed)}. nixie never grants these: each call still passes policy.`,
    compatibility === null
      ? '- `compatibility`: not set'
      : `- \`compatibility\`: ${renderCode(compatibility)}`,
  ].join('\n');
}

function renderSignature(signature: CommitSignature): readonly string[] {
  return match(signature)
    .with({ status: 'unsigned' }, () => [])
    .with({ status: 'verified' }, () => [
      '### Publisher signature',
      "The publisher signed the commit, and GitHub verified the signature against the signer's account.",
    ])
    .with({ status: 'unverified' }, (unverified) => [
      '### Publisher signature',
      `The publisher signed the commit, and GitHub could not verify the signature: ${renderCode(unverified.reason)}.`,
    ])
    .exhaustive();
}

function renderSkipped(skipped: readonly string[]): readonly string[] {
  return skipped.length === 0
    ? []
    : [
        '### Files left out',
        'The definitions source never reads a path with a part that starts with a dot, so nixie left these out:',
        renderList(
          skipped.map((path) => `- ${renderCode(path)}`),
          '',
        ),
      ];
}

function renderReview(review: CheckerAnswer | null): readonly string[] {
  if (review === null) {
    return [];
  }

  const heading = '### Advisory model review';
  const caveat = 'A model read the skill. Its view is advice only and lets nothing in.';

  if (review.failure !== null) {
    return [heading, `The review did not finish: ${review.failure}.`];
  }

  const verdict = match(review.verdict)
    .with('asserted', () => 'The model found something to look at')
    .with('not_asserted', () => 'The model found nothing beyond what the description says')
    .with('unsure', () => 'The model was unsure')
    .exhaustive();

  return [
    heading,
    caveat,
    `${verdict} (${renderCode(review.model)}): ${renderCode(review.reason)}`,
  ];
}
