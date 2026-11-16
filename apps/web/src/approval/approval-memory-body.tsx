import type { ReactNode } from 'react';
import { match } from 'ts-pattern';
import { MessageImage } from '../components/message-image';
import { SelfNoteBadge } from '../components/self-note-badge';
import { formatMemoryDate } from '../memory/format-memory-date';
import { formatMemoryProvenance } from '../memory/format-memory-provenance';
import { formatReviewReason } from '../proposal/format-review-reason';
import { css } from '../styled-system/css';
import type { MemoryProposal } from '../types';

export interface ApprovalMemoryBodyProps {
  readonly memory: MemoryProposal;

  // null while the text is not being edited
  readonly draft: string | null;
  readonly onDraft: (draft: string | null) => void;
}

const body = css({ alignItems: 'flex-start', display: 'flex', gap: '2' });
const meta = css({ fontSize: 'sm', opacity: '0.8' });
const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });

// What a memory proposal adds to a card: the text, which the user can edit before approving, and
// the evidence behind it.
export function ApprovalMemoryBody(props: ApprovalMemoryBodyProps): ReactNode {
  const memory = props.memory;
  const message = memory.evidence?.message;

  return (
    <>
      <div className={body}>
        {memory.image === null ? null : <MessageImage {...memory.image} />}
        {props.draft === null ? (
          <p className={css({ whiteSpace: 'pre-wrap' })}>{formatMemoryText(memory)}</p>
        ) : (
          <label className={field}>
            Edited text
            <textarea
              onChange={(event) => {
                props.onDraft(event.target.value);
              }}
              value={props.draft}
            />
          </label>
        )}
      </div>
      {memory.labels === null ? null : (
        <dl aria-label="Labels" className={css({ fontSize: 'sm' })}>
          <dt>Gist</dt>
          <dd>{memory.labels.gist}</dd>
          <dt>Topic</dt>
          <dd>{memory.labels.topic}</dd>
          <dt>Trigger phrases</dt>
          <dd>
            {memory.labels.triggers.length === 0 ? 'None' : memory.labels.triggers.join(', ')}
          </dd>
        </dl>
      )}
      <p className={meta}>
        {memory.subject === 'self' ? <SelfNoteBadge /> : null}
        {formatReviewReason(memory.reason)}
      </p>
      {memory.newSubject === null ? null : (
        <p className={meta}>
          Moves it from {formatSubject(memory.subject)} to {formatSubject(memory.newSubject)}.
        </p>
      )}
      {memory.isSensitive ? (
        <p className={meta}>Sensitive: once kept, it comes up only when a request needs it.</p>
      ) : null}
      {memory.until === null ? null : (
        <p className={meta}>Lasts until {formatMemoryDate(memory.until)}</p>
      )}
      <p className={meta}>Proposed {formatMemoryProvenance(memory.origin, memory.source)}</p>
      {memory.quote === null ? (
        <p className={meta}>No quote from you.</p>
      ) : (
        <blockquote className={meta}>
          “{memory.quote}”
          {message?.status === 'readable' ? ` from your message “${message.text ?? ''}”` : null}
        </blockquote>
      )}
    </>
  );
}

function formatMemoryText(memory: MemoryProposal): string {
  return match(memory.operation)
    .with('retire', () => `Retire: ${memory.text}`)
    .with('pin', () => `Pin: ${memory.text}`)
    .with('remember', () =>
      memory.labels?.isLabelOnly === true ? 'Change the labels' : memory.text,
    )
    .exhaustive();
}

function formatSubject(subject: MemoryProposal['subject']): string {
  return match(subject)
    .with('owner', () => 'a fact about you')
    .with('shared', () => 'something shared between you and nixie')
    .with('self', () => 'a self-note')
    .exhaustive();
}
