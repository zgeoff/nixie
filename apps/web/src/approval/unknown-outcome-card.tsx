import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { UnknownOutcomeItem } from '../types';
import type { UnknownOutcomeAnswerResult } from './use-unknown-outcome-answer';
import { useUnknownOutcomeAnswer } from './use-unknown-outcome-answer';

export interface UnknownOutcomeCardProps {
  readonly item: UnknownOutcomeItem;

  // asks the parent to read the list again, after an answer
  readonly onRefresh: () => void;
}

const frame = css({
  borderColor: 'borderStrong',
  borderRadius: 'md',
  borderStyle: 'solid',
  borderWidth: '4px',
  marginBlock: '2',
  padding: '3',
});

const buttons = css({ display: 'flex', flexWrap: 'wrap', gap: '2', marginTop: '2' });

const reasons = {
  inconclusive: 'The check could not tell whether it happened.',
  unknown_streak: 'It was unclear 3 times in a row.',
  no_reconcile: 'Nixie has no way to check whether it happened.',
  key_expired: 'The provider no longer keeps the key that makes a retry safe.',
  not_found_ask: 'The check found nothing, and the provider may be slow to show it.',
} as const;

const labels = { happened: 'It happened', retry: 'Retry', drop: 'Drop' } as const;

// The question about an action that may or may not have happened. Retry warns that it may send
// twice, and asks for the passkey first when the action always asks or lifts.
export function UnknownOutcomeCard(props: UnknownOutcomeCardProps): ReactNode {
  const action = props.item.action;
  const [message, setMessage] = useState<string | null>(null);

  const answerer = useUnknownOutcomeAnswer({
    actionID: action.actionID,
    passkeyChoices: props.item.passkeyChoices,
    onResult: (result: UnknownOutcomeAnswerResult) => {
      const failure =
        result.status === 'passkey_failed'
          ? 'The passkey check did not finish. Nothing changed.'
          : null;

      setMessage(failure);

      if (result.status !== 'passkey_failed') {
        props.onRefresh();
      }
    },
  });

  return (
    <li aria-label={`Unknown outcome ${action.tool}`} className={frame}>
      <p>
        <strong>Did this happen?</strong> {action.sentence}
      </p>
      <p>{reasons[action.reason]}</p>
      <ul aria-label="Fields">
        {Object.entries(action.fields).map(([name, value]) => (
          <li key={name}>
            {name}: {value}
          </li>
        ))}
      </ul>
      <ul aria-label="Attempts">
        {action.attempts.map((attempt) => (
          <li key={attempt.attempt}>
            Attempt {attempt.attempt} at {attempt.at.toLocaleString()}
          </li>
        ))}
      </ul>
      {action.checks.length === 0 ? null : (
        <ul aria-label="Checks">
          {action.checks.map((check) => (
            <li key={check.at.getTime()}>
              Check answered {check.answer.replace('_', ' ')} at {check.at.toLocaleString()}
            </li>
          ))}
        </ul>
      )}
      <p>Retry may send it twice.</p>
      <div className={buttons}>
        {props.item.choices.map((choice) => (
          <button
            disabled={answerer.isPending}
            key={choice}
            name={`unknown-${choice}`}
            onClick={() => {
              answerer.send(choice);
            }}
            type="button"
          >
            {labels[choice]}
          </button>
        ))}
      </div>
      {message === null ? null : <p role="alert">{message}</p>}
    </li>
  );
}
