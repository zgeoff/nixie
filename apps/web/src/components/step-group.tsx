import type { ReactNode } from 'react';
import { useState } from 'react';
import type { StepActivity, ToolActivity } from '../build-activity';
import { formatStepSummary } from '../format-step-summary';
import { css } from '../styled-system/css';

export interface StepGroupProps {
  readonly step: StepActivity;
}

// One step of a task as one collapsed line. Opening it names the task and shows each tool call
// with its input and its result.
export function StepGroup(props: StepGroupProps): ReactNode {
  return (
    <li className={css({ color: 'textMuted', fontSize: 'sm' })}>
      <details>
        <summary className={css({ cursor: 'pointer' })}>{formatStepSummary(props.step)}</summary>
        <div
          className={css({ display: 'flex', flexDirection: 'column', gap: '3', paddingBlock: '2' })}
        >
          <p>
            Task {props.step.taskID ?? 'unknown'}
            {props.step.stepKey === undefined ? null : `, step ${props.step.stepKey}`}
          </p>
          <p>Events: {props.step.records.map((record) => record.kind).join(', ')}</p>
          {props.step.calls.map((call) => (
            <ToolCallDetail call={call} key={call.callID} />
          ))}
        </div>
      </details>
    </li>
  );
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

// A page's text can run to many kilobytes, so a long value shows its start and opens in full on
// demand. Its toggle sticks to the top of the view until its own text ends, so an open value
// closes again without a scroll back to find the control.
const clipLength = 600;

interface ClippedTextProps {
  readonly text: string;
}

function ClippedText(props: ClippedTextProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const isLong = props.text.length > clipLength;

  return (
    <div>
      {isLong ? (
        <button
          className={css({
            backgroundColor: 'canvas',
            display: 'block',
            position: 'sticky',
            textDecoration: 'underline',
            top: '0',
          })}
          onClick={() => {
            setIsOpen(!isOpen);
          }}
          type="button"
        >
          {isOpen ? 'Show less' : `Show all ${props.text.length.toLocaleString('en')} characters`}
        </button>
      ) : null}
      <pre className={css({ overflowX: 'auto', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' })}>
        {isLong && !isOpen ? `${props.text.slice(0, clipLength)}…` : props.text}
      </pre>
    </div>
  );
}
