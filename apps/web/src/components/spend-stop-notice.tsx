import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatProviderNotice } from '../spend/format-provider-notice';
import { formatRouteNotice } from '../spend/format-route-notice';
import { formatSpendAmount } from '../spend/format-spend-amount';
import type { SpendDisplay } from '../spend/format-spend-amount';
import { formatSpendNotice } from '../spend/format-spend-notice';
import { pickRaiseOffer } from '../spend/pick-raise-offer';
import { pickRouteRaiseOffer } from '../spend/pick-route-raise-offer';
import { useSpendCounts } from '../spend/use-spend-counts';
import { useSpendRaise } from '../spend/use-spend-raise';
import { useSpendStop } from '../spend/use-spend-stop';
import { css } from '../styled-system/css';
import type { SpendProviderTrip, SpendRouteTrip, SpendTrip } from '../types';

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
  const display = useSpendCounts().data?.display ?? null;
  const stop = read.data;

  if (
    stop === undefined ||
    (stop.state === 'clear' && stop.routes.length === 0 && stop.providers.length === 0)
  ) {
    return null;
  }

  return (
    <section aria-label="model spending is stopped" className={notice}>
      {stop.state === 'clear' ? null : <p role="status">{formatSpendNotice(stop)}</p>}
      {stop.providers.map((trip) => (
        <div key={`provider-${trip.provider}-${trip.period}`}>
          <p role="status">{formatProviderNotice(trip, display)}</p>
          {trip.canRaise ? (
            <RaiseRouteLimit
              display={display}
              name={trip.provider}
              target={{ provider: trip.provider }}
              trip={trip}
            />
          ) : null}
        </div>
      ))}
      {stop.routes.map((trip) => (
        <div key={`${trip.route}-${trip.period}`}>
          <p role="status">{formatRouteNotice(trip, display)}</p>
          {trip.canRaise ? (
            <RaiseRouteLimit
              display={display}
              name={trip.route}
              target={{ route: trip.route }}
              trip={trip}
            />
          ) : null}
        </div>
      ))}
      {stop.state === 'tripped' && stop.canRaise ? <RaiseLimit stop={stop} /> : null}
    </section>
  );
}

interface RaiseRouteLimitProps {
  readonly trip: SpendRouteTrip | SpendProviderTrip;

  // the route or the provider, as the buttons name it
  readonly name: string;

  // what the raise names, a route or a provider
  readonly target: { readonly route: string } | { readonly provider: string };
  readonly display: SpendDisplay | null;
}

// The raise of a route's or a provider's day limit in dollars. One confirm is the whole approval,
// and the amount stays editable until it.
function RaiseRouteLimit(props: RaiseRouteLimitProps): ReactNode {
  const trip = props.trip;
  const offer = pickRouteRaiseOffer(trip);
  const raise = useSpendRaise();
  const [isOpen, setIsOpen] = useState(false);
  const [dollars, setDollars] = useState(offer.dollars);

  if (!isOpen) {
    return (
      <div>
        <button
          onClick={() => {
            setDollars(offer.dollars);
            setIsOpen(true);
          }}
          type="button"
        >
          Raise the day limit of {props.name}
        </button>
      </div>
    );
  }

  const answer = raise.data;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        raise.mutate({ start: trip.start, ...props.target, dollars });
      }}
    >
      <fieldset disabled={raise.isPending}>
        <legend>Raise the day limit of {props.name} to</legend>
        <AmountField
          cap={trip.cap ?? trip.limit}
          label="US dollars"
          onChange={setDollars}
          value={dollars}
        />
        {Number.isNaN(dollars) ? null : <p>{formatSpendAmount(dollars, props.display)}</p>}
        <button type="submit">Confirm raise of {props.name}</button>
      </fieldset>
      {raise.isError ? <p role="alert">The raise did not finish. Try again.</p> : null}
      {answer !== undefined && 'error' in answer ? (
        <p role="alert">{describeRefusal(answer, props.display)}</p>
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

function describeRefusal(refusal: Refusal, display: SpendDisplay | null): string {
  if (refusal.error === 'above_cap') {
    const cap =
      refusal.measure === 'dollars'
        ? formatSpendAmount(refusal.cap, display)
        : `${refusal.cap.toLocaleString()} turns`;

    return `That is above the cap of ${cap} for today.`;
  }

  if (refusal.error === 'period_ended') {
    return "The day ended, so today's limit resets on its own.";
  }

  if (refusal.error === 'unknown_route') {
    return 'The spending gateway holds no such route.';
  }

  if (refusal.error === 'unknown_provider') {
    return 'The spending gateway holds no such provider.';
  }

  if (refusal.error === 'no_route_limit') {
    return `${refusal.route} has no limit of its own, so only its provider's limit binds it.`;
  }

  if (refusal.error === 'unanswered') {
    return 'nixie could not reach the spending gateway. Your raise is saved, and applies when it answers.';
  }

  return 'nixie could not reach the spending gateway, so your raise was not saved. Try again when it answers.';
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
          cap={stop.cap}
          label="Turns"
          onChange={(turns) => {
            setAmounts({ turns });
          }}
          value={amounts.turns}
        />
        <button type="submit">Confirm raise</button>
      </fieldset>
      {raise.isError ? <p role="alert">The raise did not finish. Try again.</p> : null}
      {answer !== undefined && 'error' in answer ? (
        <p role="alert">{describeRefusal(answer, null)}</p>
      ) : null}
    </form>
  );
}
