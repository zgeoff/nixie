import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatSpendNotice } from '../spend/format-spend-notice';
import { pickRaiseOffer } from '../spend/pick-raise-offer';
import { useSpendRaise } from '../spend/use-spend-raise';
import { useSpendStop } from '../spend/use-spend-stop';
import { css } from '../styled-system/css';
import type { SpendTrip } from '../types';

const notice = css({
  borderBlockEnd: '1px solid',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 'sm',
  gap: '2',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});

export function SpendStopNotice(): ReactNode {
  const read = useSpendStop();
  const stop = read.data;

  if (stop === undefined || stop.state === 'clear') {
    return null;
  }

  return (
    <section aria-label="model spending is stopped" className={notice}>
      <p role="status">{formatSpendNotice(stop)}</p>
      {stop.state === 'tripped' && stop.canRaise ? <RaiseLimit stop={stop} /> : null}
    </section>
  );
}

interface RaiseLimitProps {
  readonly stop: SpendTrip;
}

// One confirm is the whole approval, and the amounts stay editable until it.
function RaiseLimit(props: RaiseLimitProps): ReactNode {
  const stop = props.stop;
  const offer = pickRaiseOffer(stop);
  const raise = useSpendRaise();
  const [isOpen, setIsOpen] = useState(false);
  const [amounts, setAmounts] = useState({ ...offer });

  if (!isOpen) {
    return (
      <div>
        <button
          onClick={() => {
            setAmounts({ ...offer });
            setIsOpen(true);
          }}
          type="button"
        >
          Raise today&apos;s limit
        </button>
      </div>
    );
  }

  const answer = raise.data;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        raise.mutate({ start: stop.start, ...amounts });
      }}
    >
      <fieldset disabled={raise.isPending}>
        <legend>Raise today&apos;s limit to</legend>
        <AmountField
          cap={stop.cap.dollars}
          label="Dollars"
          onChange={(dollars) => {
            setAmounts({ ...amounts, dollars });
          }}
          value={amounts.dollars}
        />
        <AmountField
          cap={stop.cap.tokens}
          label="Tokens"
          onChange={(tokens) => {
            setAmounts({ ...amounts, tokens });
          }}
          value={amounts.tokens}
        />
        <AmountField
          cap={stop.cap.turns}
          label="Turns"
          onChange={(turns) => {
            setAmounts({ ...amounts, turns });
          }}
          value={amounts.turns}
        />
        <button type="submit">Confirm raise</button>
      </fieldset>
      {raise.isError ? <p role="alert">The raise did not finish. Try again.</p> : null}
      {answer !== undefined && 'error' in answer ? (
        <p role="alert">{describeRefusal(answer)}</p>
      ) : null}
    </form>
  );
}

interface AmountFieldProps {
  readonly cap: number;
  readonly label: string;
  readonly onChange: (value: number) => void;
  readonly value: number;
}

function AmountField(props: AmountFieldProps): ReactNode {
  return (
    <label>
      {props.label}
      <input
        max={props.cap}
        min={0}
        onChange={(event) => {
          props.onChange(event.currentTarget.valueAsNumber);
        }}
        step="any"
        type="number"
        value={Number.isNaN(props.value) ? '' : props.value}
      />
    </label>
  );
}

type Refusal = Extract<
  NonNullable<ReturnType<typeof useSpendRaise>['data']>,
  { readonly error: string }
>;

function describeRefusal(refusal: Refusal): string {
  if (refusal.error === 'above_cap') {
    return `That is above the cap of $${refusal.cap.dollars.toLocaleString()}, ${refusal.cap.tokens.toLocaleString()} tokens and ${refusal.cap.turns.toLocaleString()} turns for today.`;
  }

  if (refusal.error === 'period_ended') {
    return "The day ended, so today's limit resets on its own.";
  }

  return 'nixie could not reach the spending gateway. Your raise is saved, and applies when it answers.';
}
