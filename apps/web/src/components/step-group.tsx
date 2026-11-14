import { forgettableKinds } from '@heynixie/contract';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { StepActivity, ToolActivity } from '../conversation/build-activity';
import { formatStepSummary } from '../conversation/format-step-summary';
import { css } from '../styled-system/css';
import type { ForgetBackup } from '../types';
import { ClippedText } from './clipped-text';
import { CompactionMarker } from './compaction-marker';
import { ForgetBackupLine } from './forget-backup-line';
import { ForgetControl } from './forget-control';
import { StepContext } from './step-context';
import { StepMemories } from './step-memories';
import { StepSection } from './step-section';
import { SummaryMarker } from './summary-marker';

export interface StepGroupProps {
  readonly step: StepActivity;
}

export function StepGroup(props: StepGroupProps): ReactNode {
  const step = props.step;

  return (
    <li className={css({ color: 'textMuted', fontSize: 'sm' })}>
      <details>
        <summary className={css({ cursor: 'pointer' })}>{formatStepSummary(step)}</summary>
        <div
          className={css({ display: 'flex', flexDirection: 'column', gap: '3', paddingBlock: '2' })}
        >
          <StepSection title="Step">
            <p>{formatStepLine(step)}</p>
          </StepSection>
          {step.memories === undefined ? null : <StepMemories memories={step.memories} />}
          {step.context === undefined && step.compactions === undefined ? null : (
            <StepContext compactions={step.compactions ?? []} context={step.context} />
          )}
          <StepSection title={`Tools ${step.calls.length}`}>
            {step.calls.map((call) => (
              <ToolCallDetail call={call} key={call.callID} />
            ))}
          </StepSection>
          {step.error === undefined ? null : (
            <StepSection title="Error">
              <p>{step.error}</p>
            </StepSection>
          )}
        </div>
      </details>
      {step.compactions?.map((compaction) => (
        <CompactionMarker compaction={compaction} key={compaction.sequence} />
      ))}
      {step.summaries?.map((summary) => (
        <SummaryMarker key={summary.sequence} summary={summary} />
      ))}
    </li>
  );
}

function formatStepLine(step: StepActivity): string {
  const events = step.records.map((record) => record.kind.replace(/^(?:task\.step_|model\.)/u, ''));

  return [
    `task ${step.taskID ?? 'unknown'}`,
    ...(step.stepKey === undefined ? [] : [`step ${step.stepKey}`]),
    `events: ${events.join(', ')}`,
  ].join(' · ');
}

interface ToolCallDetailProps {
  readonly call: ToolActivity;
}

const forgettable: readonly string[] = forgettableKinds;

function ToolCallDetail(props: ToolCallDetailProps): ReactNode {
  const [isForgetOpen, setForgetOpen] = useState(false);
  const [backup, setBackup] = useState<ForgetBackup | null>(null);
  const call = props.call;
  const result = call.result;
  const isRemoved = call.isRemoved === true || backup !== null;

  // Only a result on the conversation thread has a control: a task's records are not the owner's to
  // forget. A forget that has not finished keeps its control, so the owner can try again.
  const hasControl =
    result !== undefined &&
    forgettable.includes(result.kind) &&
    result.thread === 'conversation' &&
    (!isRemoved || isForgetOpen);

  const backupLine = backup === null ? null : <ForgetBackupLine backup={backup} />;

  if (isRemoved) {
    return (
      <section aria-label={call.tool}>
        <h3 className={css({ fontWeight: 'semibold' })}>{call.tool} — removed</h3>
        <p>Result{call.outcome === undefined ? ' (waiting)' : ` (${call.outcome})`}</p>
        {hasControl ? renderControl(call, setForgetOpen, setBackup) : null}
        {backupLine}
      </section>
    );
  }

  return (
    <section aria-label={call.tool}>
      <h3 className={css({ fontWeight: 'semibold' })}>{call.tool}</h3>
      <p>Input</p>
      <ClippedText text={formatJSON(call.input)} />
      <p>Result{call.outcome === undefined ? ' (waiting)' : ` (${call.outcome})`}</p>
      <ClippedText text={formatJSON(call.content)} />
      {hasControl ? renderControl(call, setForgetOpen, setBackup) : null}
      {backupLine}
    </section>
  );
}

function renderControl(
  call: ToolActivity,
  onOpenChange: (isOpen: boolean) => void,
  onBackup: (backup: ForgetBackup) => void,
): ReactNode {
  const result = call.result;

  if (result === undefined) {
    return null;
  }

  return (
    <ForgetControl
      hasText={call.isRemoved !== true && call.content !== undefined}
      kind={result.kind}
      label="Forget this result"
      onForgotten={onBackup}
      onOpenChange={onOpenChange}
      sequence={result.sequence}
      thread={result.thread}
    />
  );
}

function formatJSON(value: unknown): string {
  return value === undefined ? 'none' : JSON.stringify(value, null, 2);
}
