import type { ReactNode } from 'react';
import { buildWordDiff } from '../build-word-diff';
import { formatMemoryChecks } from '../format-memory-checks';
import { formatMemoryDate } from '../format-memory-date';
import { formatMemoryProvenance } from '../format-memory-provenance';
import { splitEvidenceMessage } from '../split-evidence-message';
import { css } from '../styled-system/css';
import type { MemoryVersion } from '../types';

export interface MemoryVersionListProps {
  readonly versions: readonly MemoryVersion[];
}

const list = css({ display: 'flex', flexDirection: 'column', gap: '3', marginBlock: '2' });

export function MemoryVersionList(props: MemoryVersionListProps): ReactNode {
  const versions = props.versions;

  return (
    <ol aria-label="History" className={list}>
      {versions.map((version, index) => (
        <VersionEntry key={version.version} previous={versions[index - 1]} version={version} />
      ))}
    </ol>
  );
}

const changes = {
  created: 'Created',
  edited: 'Edited',
  retired: 'Retired',
  restored: 'Restored',
  undone: 'Undone',
};

interface VersionEntryProps {
  readonly version: MemoryVersion;
  readonly previous: MemoryVersion | undefined;
}

const entry = css({ borderInlineStartWidth: '2px', paddingInlineStart: '3' });
const meta = css({ color: 'textMuted', fontSize: 'sm' });

function VersionEntry(props: VersionEntryProps): ReactNode {
  const version = props.version;

  return (
    <li aria-label={`Version ${version.version}`} className={entry}>
      <p className={meta}>
        Version {version.version} · {changes[version.change]} ·{' '}
        {formatMemoryDate(version.recordedAt)} ·{' '}
        {formatMemoryProvenance(version.origin, version.source)}
      </p>
      {version.status === 'readable' ? (
        <VersionText previous={props.previous} version={version} />
      ) : (
        <p className={meta}>
          {version.status === 'shredded' ? '(forgotten)' : '(text unavailable)'}
        </p>
      )}
      <VersionEvidence version={version} />
      <VersionProvenance version={version} />
    </li>
  );
}

function VersionText(props: VersionEntryProps): ReactNode {
  const text = props.version.text ?? '';
  const before = props.previous?.status === 'readable' ? props.previous.text : undefined;

  return (
    <>
      <p className={css({ whiteSpace: 'pre-wrap' })}>{text}</p>
      {before === undefined || before === text ? null : (
        <p aria-label="Changes" className={css({ fontSize: 'sm', whiteSpace: 'pre-wrap' })}>
          <DiffRuns after={text} before={before} />
        </p>
      )}
    </>
  );
}

interface DiffRunsProps {
  readonly before: string;
  readonly after: string;
}

function DiffRuns(props: DiffRunsProps): ReactNode {
  const parts = buildWordDiff(props.before, props.after);

  return parts.map((part, index) => <DiffRun key={index} kind={part.kind} text={part.text} />);
}

interface DiffRunProps {
  readonly kind: 'same' | 'added' | 'removed';
  readonly text: string;
}

function DiffRun(props: DiffRunProps): ReactNode {
  if (props.kind === 'added') {
    return <ins className={css({ backgroundColor: 'surface' })}>{props.text}</ins>;
  }

  if (props.kind === 'removed') {
    return <del className={css({ color: 'textMuted' })}>{props.text}</del>;
  }

  return props.text;
}

interface VersionProps {
  readonly version: MemoryVersion;
}

const evidenceBox = css({ backgroundColor: 'surface', marginBlock: '1', padding: '2' });

function VersionEvidence(props: VersionProps): ReactNode {
  const evidence = props.version.evidence;
  const quote = props.version.evidenceQuote;

  if (evidence?.message?.status === 'readable') {
    const split = splitEvidenceMessage(evidence.message.text ?? '', evidence.start, evidence.end);

    return (
      <figure aria-label="Evidence" className={evidenceBox}>
        <blockquote className={css({ whiteSpace: 'pre-wrap' })}>
          {split.before}
          <mark>{split.quote}</mark>
          {split.after}
        </blockquote>
        <figcaption className={meta}>From your message</figcaption>
      </figure>
    );
  }

  if (quote === null) {
    return null;
  }

  return (
    <figure aria-label="Evidence" className={evidenceBox}>
      <blockquote className={css({ whiteSpace: 'pre-wrap' })}>
        <mark>{quote}</mark>
      </blockquote>
      <figcaption className={meta}>{formatMissingMessage(evidence?.message?.status)}</figcaption>
    </figure>
  );
}

function formatMissingMessage(status: string | undefined): string {
  if (status === 'shredded') {
    return 'The message it came from was forgotten';
  }

  return status === undefined
    ? 'The quote it came from'
    : 'The message it came from is unavailable';
}

const factList = css({ color: 'textMuted', fontSize: 'sm' });

function VersionProvenance(props: VersionProps): ReactNode {
  const version = props.version;

  const facts = [
    ['Task', version.taskID],
    ['Proposal', version.proposalID],
    ['Checks', version.checks === null ? null : formatMemoryChecks(version.checks)],
    ['Writer model', version.writerModel],
    ['Checker model', version.checkerModel],
  ].filter((fact): fact is [string, string] => typeof fact[1] === 'string' && fact[1] !== '');

  if (facts.length === 0) {
    return null;
  }

  return (
    <dl className={factList}>
      {facts.map(([term, value]) => (
        <div key={term} className={css({ display: 'flex', gap: '1' })}>
          <dt>{term}:</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
