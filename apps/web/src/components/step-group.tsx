import type { ReactNode } from 'react';
import type { StepActivity, ToolActivity } from '../build-activity';
import { formatStepSummary } from '../format-step-summary';
import { css } from '../styled-system/css';
import { ClippedText } from './clipped-text';
import { CompactionMarker } from './compaction-marker';
import { StepContext } from './step-context';
import { StepMemories } from './step-memories';
import { StepSection } from './step-section';

export interface StepGroupProps {
  readonly step: StepActivity;
}

// One step of a task as one collapsed line, with a marker under it for each compaction. Opening it
// shows a collapsible section per source: the step, its memories, its context, its tool calls with
// their inputs and results, and the error of a failed step.
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
