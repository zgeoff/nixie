import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { RecalledMemory, StepActivity, ToolActivity } from '../build-activity';
import { formatStepSummary } from '../format-step-summary';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';
import { ClippedText } from './clipped-text';

export interface StepGroupProps {
  readonly step: StepActivity;
}

// One step of a task as one collapsed line. Opening it shows one collapsible section per source of
// what the step was given and did: the step itself, the memories its recalls delivered, its tool
// calls with their inputs and results, and the error of a failed step.
export function StepGroup(props: StepGroupProps): ReactNode {
  const step = props.step;

  return (
    <li className={css({ color: 'textMuted', fontSize: 'sm' })}>
      <details>
        <summary className={css({ cursor: 'pointer' })}>{formatStepSummary(step)}</summary>
        <div
          className={css({ display: 'flex', flexDirection: 'column', gap: '3', paddingBlock: '2' })}
        >
          <Section title="Step">
            <p>{formatStepLine(step)}</p>
          </Section>
          {step.memories === undefined ? null : <MemoriesSection memories={step.memories} />}
          <Section title={`Tools ${step.calls.length}`}>
            {step.calls.map((call) => (
              <ToolCallDetail call={call} key={call.callID} />
            ))}
          </Section>
          {step.error === undefined ? null : (
            <Section title="Error">
              <p>{step.error}</p>
            </Section>
          )}
        </div>
      </details>
    </li>
  );
}

// task conversation · step conversation:146 · events: started, memory.recalled, committed
function formatStepLine(step: StepActivity): string {
  const events = step.records.map((record) => record.kind.replace(/^(?:task\.step_|model\.)/u, ''));

  return [
    `task ${step.taskID ?? 'unknown'}`,
    ...(step.stepKey === undefined ? [] : [`step ${step.stepKey}`]),
    `events: ${events.join(', ')}`,
  ].join(' · ');
}

interface SectionProps {
  readonly children: ReactNode;
  readonly title: string;

  // called each time the section opens or closes
  readonly onToggle?: (isOpen: boolean) => void;
}

// One collapsible section of an opened step, closed until you open it.
function Section(props: SectionProps): ReactNode {
  return (
    <details
      aria-label={props.title}
      onToggle={(event) => {
        props.onToggle?.(event.currentTarget.open);
      }}
    >
      <summary className={css({ cursor: 'pointer', fontWeight: 'semibold' })}>
        {props.title}
      </summary>
      <div className={css({ paddingInlineStart: '4' })}>{props.children}</div>
    </details>
  );
}

interface MemoriesSectionProps {
  readonly memories: readonly RecalledMemory[];
}

// The memories the step's recalls delivered, each with its match score. Their text loads when the
// section first opens, because a recall record holds no text.
function MemoriesSection(props: MemoriesSectionProps): ReactNode {
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <Section
      onToggle={(isOpen) => {
        setHasOpened((opened) => opened || isOpen);
      }}
      title={`Memories ${props.memories.length}`}
    >
      {hasOpened && props.memories.length > 0 ? <MemoryList memories={props.memories} /> : null}
    </Section>
  );
}

function MemoryList(props: MemoriesSectionProps): ReactNode {
  const nixie = useNixieClient();
  const texts = useQuery(
    nixie.queryUtils.memory.readVersions.queryOptions({
      input: {
        versions: props.memories.map((memory) => ({
          itemID: memory.itemID,
          version: memory.version,
        })),
      },
      staleTime: Number.POSITIVE_INFINITY,
    }),
  );
  const byVersion = new Map(
    (texts.data?.versions ?? []).map((version) => [
      `${version.itemID}@${version.version}`,
      formatMemoryText(version),
    ]),
  );
  const fallback = texts.isError ? '(text unavailable)' : 'loading…';

  return (
    <ul>
      {props.memories.map((memory) => (
        <MemoryRow
          key={`${memory.itemID}@${memory.version}`}
          memory={memory}
          text={byVersion.get(`${memory.itemID}@${memory.version}`) ?? fallback}
        />
      ))}
    </ul>
  );
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
  const score = props.memory.score === undefined ? '–' : props.memory.score.toFixed(2);

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

const lineLimit = 80;

// the text's first line, clipped
function formatOneLine(text: string): string {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const isClipped = firstLine.length > lineLimit || firstLine.length < text.trimEnd().length;

  return isClipped ? `${firstLine.slice(0, lineLimit)}…` : firstLine;
}

interface ToolCallDetailProps {
  readonly call: ToolActivity;
}

function ToolCallDetail(props: ToolCallDetailProps): ReactNode {
  return (
    <section aria-label={props.call.tool}>
      <h3 className={css({ fontWeight: 'semibold' })}>{props.call.tool}</h3>
      <p>Input</p>
      <ClippedText text={formatJSON(props.call.input)} />
      <p>Result{props.call.outcome === undefined ? ' (waiting)' : ` (${props.call.outcome})`}</p>
      <ClippedText text={formatJSON(props.call.content)} />
    </section>
  );
}

function formatJSON(value: unknown): string {
  return value === undefined ? 'none' : JSON.stringify(value, null, 2);
}
