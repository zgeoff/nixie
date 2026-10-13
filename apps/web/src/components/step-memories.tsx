import { useQueries } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { RecalledMemory } from '../build-activity';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';
import { StepSection } from './step-section';

export interface StepMemoriesProps {
  readonly memories: readonly RecalledMemory[];
}

// The memories the step's recalls delivered, each with its match score. A recall record holds no
// text, so the list reads the text each time the section opens, and a memory forgotten since then
// shows as forgotten.
export function StepMemories(props: StepMemoriesProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <StepSection onToggle={setIsOpen} title={`Memories ${props.memories.length}`}>
      {isOpen && props.memories.length > 0 ? <MemoryList memories={props.memories} /> : null}
    </StepSection>
  );
}

// the most versions one call to the API reads
const batchSize = 100;

// Reads the text of each distinct version in batches the API accepts. A step can recall one version
// twice, so each row's key holds its place as well.
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
  const batches = Array.from({ length: Math.ceil(refs.length / batchSize) }, (_, index) =>
    refs.slice(index * batchSize, (index + 1) * batchSize),
  );

  // A query keeps its last data while it reads again and after that read fails, and that data can
  // hold the text of a memory forgotten since, so only a finished, successful read gives text.
  const texts = useQueries({
    combine: (results) => ({
      isError: results.some((result) => result.isError),
      versions: results.flatMap((result) =>
        result.isSuccess && !result.isFetching ? result.data.versions : [],
      ),
    }),
    queries: batches.map((versions) =>
      nixie.queryUtils.memory.readVersions.queryOptions({ input: { versions } }),
    ),
  });
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

interface VersionText {
  readonly status: 'readable' | 'shredded' | 'unreadable' | 'missing';
  readonly text?: string | undefined;
}

function formatMemoryText(version: VersionText): string {
  if (version.status === 'readable') {
    return version.text ?? '';
  }

  return version.status === 'shredded' ? '(forgotten)' : `(${version.status})`;
}

interface MemoryRowProps {
  readonly memory: RecalledMemory;
  readonly text: string;
}

// One memory as one line, its ID, score and the start of its text; opened, its full text.
function MemoryRow(props: MemoryRowProps): ReactNode {
  const score = props.memory.score === undefined ? '–' : formatScore(props.memory.score);

  return (
    <li>
      <details aria-label={props.memory.itemID}>
        <summary className={css({ cursor: 'pointer' })}>
          {`${props.memory.itemID}  ${score}  ${formatOneLine(props.text)}`}
        </summary>
        <p className={css({ whiteSpace: 'pre-wrap' })}>{props.text}</p>
      </details>
    </li>
  );
}

// BM25 gives a common word a score near zero, such as 1.1e-6, so a score below 0.01 shows its
// significant digits and two such matches still read apart.
function formatScore(score: number): string {
  return Math.abs(score) >= 0.01 || score === 0 ? score.toFixed(2) : score.toExponential(1);
}

const lineLimit = 80;

// the text's first line, clipped
function formatOneLine(text: string): string {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const isClipped = firstLine.length > lineLimit || firstLine.length < text.trimEnd().length;

  return isClipped ? `${firstLine.slice(0, lineLimit)}…` : firstLine;
}
