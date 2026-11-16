import type { ReactNode } from 'react';
import { z } from 'zod';
import type { ToolActivity } from '../conversation/build-activity';
import { formatTarget, formatToolName } from '../conversation/format-step-summary';
import { formatWorkerLine } from '../conversation/format-worker-line';
import type { ReadablePayload } from '../conversation/use-whole-payloads';
import { useWholePayloads } from '../conversation/use-whole-payloads';
import type { WorkerActivity } from '../conversation/worker-activity';
import { css } from '../styled-system/css';
import { StepSection } from './step-section';
import { WholeValueControl } from './whole-value-control';

export interface WorkerLineProps {
  readonly worker: WorkerActivity;
}

const text = css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' });
const forgotten = css({ color: 'textMuted', fontStyle: 'italic' });

// One worker run: a collapsed line with its outcome and usage, and below it the question, the
// answer, each source and each turn. The answer and the turn texts came from a model and from the
// pages it read, so each shows as plain text.
export function WorkerLine(props: WorkerLineProps): ReactNode {
  const worker = props.worker;
  const call = worker.call;

  const cut = [
    ...(call.isInputCut === true && call.called !== undefined ? [call.called] : []),
    ...(call.isContentCut === true && call.result !== undefined ? [call.result] : []),
    ...worker.turns.flatMap((turn) => (turn.isCut ? [turn.record] : [])),
    ...(worker.end?.isCut === true ? [worker.end.record] : []),
  ];

  const whole = useWholePayloads(cut);
  const question = pickQuestion(call, whole.payloads.get(call.called?.sequence ?? -1));
  const answer = pickAnswer(call, whole.payloads.get(call.result?.sequence ?? -1));
  const detail = pickDetail(worker, whole.payloads);

  return (
    <section aria-label={`Worker ${worker.shortID ?? worker.workerRunID}`}>
      <details>
        <summary className={css({ cursor: 'pointer' })}>
          {formatWorkerLine(worker, question.text)}
        </summary>
        <div
          className={css({ display: 'flex', flexDirection: 'column', gap: '2', paddingBlock: '2' })}
        >
          {cut.length === 0 ? null : <WholeValueControl whole={whole} />}
          <StepSection title="Question">
            <p className={question.isForgotten ? forgotten : text}>
              {question.text ?? 'Forgotten.'}
            </p>
          </StepSection>
          <StepSection title="Answer">
            <p className={answer.isForgotten ? forgotten : text}>{answer.text}</p>
          </StepSection>
          {worker.end === undefined || worker.end.outcome === 'answered' ? null : (
            <StepSection title="Outcome">
              <p className={text}>
                {[worker.end.outcome, worker.end.limit, detail]
                  .filter((part) => part !== undefined)
                  .join(' · ')}
              </p>
            </StepSection>
          )}
          <StepSection title={`Sources ${worker.calls.length}`}>
            <ul>
              {worker.calls.map((source) => (
                <li key={source.callID}>{formatSource(source)}</li>
              ))}
            </ul>
          </StepSection>
          <StepSection title={`Turns ${worker.turns.length}`}>
            <ol>
              {worker.turns.map((turn) => {
                const shown = whole.payloads.get(turn.record.sequence)?.worker?.text ?? turn.text;

                return (
                  <li key={turn.turn}>
                    <span>
                      Turn {turn.turn} · {turn.tokens.toLocaleString('en')} tokens · $
                      {turn.dollars.toFixed(2)}
                    </span>
                    <p className={shown === undefined ? forgotten : text}>
                      {shown ?? 'Forgotten.'}
                    </p>
                  </li>
                );
              })}
            </ol>
          </StepSection>
        </div>
      </details>
    </section>
  );
}

interface PartText {
  readonly isForgotten: boolean;
  readonly text: string | undefined;
}

function pickQuestion(call: ToolActivity, loaded: ReadablePayload | undefined): PartText {
  const input = call.isRemoved === true ? undefined : (loaded?.toolCall?.input ?? call.input);
  const question = input?.['question'];

  return typeof question === 'string'
    ? { isForgotten: false, text: question }
    : { isForgotten: true, text: undefined };
}

const answerSchema = z.object({ result: z.object({ answer: z.string() }) });

function pickAnswer(call: ToolActivity, loaded: ReadablePayload | undefined): PartText {
  if (call.outcome === undefined) {
    return { isForgotten: false, text: 'No answer yet.' };
  }

  const content = call.isRemoved === true ? undefined : (loaded?.toolCall?.content ?? call.content);
  const answer = answerSchema.safeParse(content).data?.result.answer;

  if (answer !== undefined) {
    return { isForgotten: false, text: answer };
  }

  return call.isRemoved === true || content === undefined
    ? { isForgotten: true, text: 'Forgotten.' }
    : { isForgotten: false, text: `No answer (${call.outcome}).` };
}

function pickDetail(
  worker: WorkerActivity,
  payloads: ReadonlyMap<number, ReadablePayload>,
): string | undefined {
  const end = worker.end;

  return end === undefined
    ? undefined
    : (payloads.get(end.record.sequence)?.worker?.detail ?? end.detail);
}

function formatSource(call: ToolActivity): string {
  const target = formatTarget(call);
  const name = formatToolName(call.tool);

  return target === undefined ? name : `${name}: ${target}`;
}
