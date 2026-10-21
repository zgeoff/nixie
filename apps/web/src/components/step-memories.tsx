import { useQueries } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { MemoryRating, RecalledMemory } from '../build-activity';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';
import { StepSection } from './step-section';

export interface StepMemoriesProps {
  readonly memories: readonly RecalledMemory[];
}

export function StepMemories(props: StepMemoriesProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <StepSection onToggle={setIsOpen} title={`Memories ${props.memories.length}`}>
      {isOpen && props.memories.length > 0 ? <MemoryList memories={props.memories} /> : null}
    </StepSection>
  );
}

function MemoryList(props: StepMemoriesProps): ReactNode {
  const nixie = useNixieClient();

  const refs = [
    ...new Map(
      props.memories.map((memory) => [
        buildVersionKey(memory),
        { itemID: memory.itemID, version: memory.version },
      ]),
    ).values(),
  ];

  // TanStack Query keeps a query's last data while it reads again and after that read fails, and
  // that data can hold the text of a memory forgotten since.
  const texts = useQueries({
    combine: (results) => ({
      isError: results.some((result) => result.isError),
      versions: results.flatMap((result) =>
        result.isSuccess && !result.isFetching ? result.data.versions : [],
      ),
    }),
    queries: splitBatches(refs).map((versions) =>
      nixie.queryUtils.memory.readVersions.queryOptions({ input: { versions } }),
    ),
  });

  const byNote = useRatingNotes(props.memories);

  const byVersion = new Map(
    texts.versions.map((version) => [buildVersionKey(version), formatMemoryText(version)]),
  );

  const fallback = texts.isError ? '(text unavailable)' : 'loading…';

  return (
    <ul>
      {props.memories.map((memory, index) => (
        <MemoryRow
          key={`${buildVersionKey(memory)}#${index}`}
          memory={memory}
          note={
            memory.rating === undefined
              ? undefined
              : byNote.get(buildNoteKey(memory.rating.sequence, memory.itemID))
          }
          text={byVersion.get(buildVersionKey(memory)) ?? fallback}
        />
      ))}
    </ul>
  );
}

interface VersionRef {
  readonly itemID: string;
  readonly version: number;
}

function buildVersionKey(ref: VersionRef): string {
  return `${ref.itemID}@${ref.version}`;
}

const batchSize = 100;

function splitBatches<Ref>(refs: readonly Ref[]): Ref[][] {
  return Array.from({ length: Math.ceil(refs.length / batchSize) }, (_, index) =>
    refs.slice(index * batchSize, (index + 1) * batchSize),
  );
}

function useRatingNotes(
  memories: readonly RecalledMemory[],
): ReadonlyMap<string, string | undefined> {
  const nixie = useNixieClient();

  const refs = [
    ...new Map(
      memories.flatMap((memory) =>
        memory.rating?.hasNote === true
          ? [
              [
                buildNoteKey(memory.rating.sequence, memory.itemID),
                { itemID: memory.itemID, sequence: memory.rating.sequence },
              ] as const,
            ]
          : [],
      ),
    ).values(),
  ];

  const notes = useQueries({
    combine: (results) =>
      results.flatMap((result) =>
        result.isSuccess && !result.isFetching ? result.data.notes : [],
      ),
    queries: splitBatches(refs).map((batch) =>
      nixie.queryUtils.memory.readRatingNotes.queryOptions({ input: { notes: batch } }),
    ),
  });

  return new Map(
    notes.map((note) => [buildNoteKey(note.sequence, note.itemID), formatNoteText(note)]),
  );
}

function buildNoteKey(sequence: number, itemID: string): string {
  return `${sequence}:${itemID}`;
}

interface VersionText {
  readonly status: 'readable' | 'shredded' | 'unreadable' | 'missing';
  readonly text?: string | undefined;
}

function formatNoteText(note: VersionText): string | undefined {
  if (note.status === 'readable') {
    return `"${note.text ?? ''}"`;
  }

  return note.status === 'shredded' ? '(note forgotten)' : undefined;
}

function formatMemoryText(version: VersionText): string {
  if (version.status === 'readable') {
    return version.text ?? '';
  }

  return version.status === 'shredded' ? '(forgotten)' : `(${version.status})`;
}

interface MemoryRowProps {
  readonly memory: RecalledMemory;

  readonly note: string | undefined;
  readonly text: string;
}

function MemoryRow(props: MemoryRowProps): ReactNode {
  const score = props.memory.score === undefined ? '–' : formatScore(props.memory.score);
  const line = `${props.memory.itemID}  ${score}  ${formatOneLine(props.text)}`;

  return (
    <li>
      <details aria-label={props.memory.itemID}>
        <summary className={css({ cursor: 'pointer' })}>
          {props.memory.rating === undefined
            ? line
            : `${line}  ${formatRating(props.memory.rating, props.note)}`}
        </summary>
        <p className={css({ whiteSpace: 'pre-wrap' })}>{props.text}</p>
      </details>
    </li>
  );
}

// BM25 gives a common word a score near zero, such as 1.1e-6, so a score below 0.01 shows its
// significant digits.
function formatScore(score: number): string {
  return Math.abs(score) >= 0.01 || score === 0 ? score.toFixed(2) : score.toExponential(1);
}

const lineLimit = 80;

function formatOneLine(text: string): string {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const isClipped = firstLine.length > lineLimit || firstLine.length < text.trimEnd().length;

  return isClipped ? `${firstLine.slice(0, lineLimit)}…` : firstLine;
}

function formatRating(rating: MemoryRating, note: string | undefined): string {
  const by = rating.ratedBy ?? 'agent';

  return note === undefined ? `[${by}: ${rating.verdict}]` : `[${by}: ${rating.verdict} · ${note}]`;
}
