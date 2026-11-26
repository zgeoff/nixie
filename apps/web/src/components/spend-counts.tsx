import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatSpendAmount } from '../spend/format-spend-amount';
import type { SpendDisplay } from '../spend/format-spend-amount';
import { useSpendCounts } from '../spend/use-spend-counts';
import { useSpendSetCount } from '../spend/use-spend-set-count';
import { css } from '../styled-system/css';
import type { SpendCountsRead, SpendPeriodCount } from '../types';

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const routeCard = css({
  borderWidth: '1px',
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  padding: '4',
});

const muted = css({ color: 'textMuted', fontSize: 'sm' });

export function SpendCounts(): ReactNode {
  const read = useSpendCounts();
  const counts = read.data;

  if (counts === undefined) {
    return (
      <section aria-label="model spending" className={page}>
        <h1>Model spending</h1>
        <p className={muted}>{read.isError ? 'The counts did not load.' : 'Loading the counts.'}</p>
      </section>
    );
  }

  return (
    <section aria-label="model spending" className={page}>
      <h1>Model spending</h1>
      <p className={muted}>
        Counts and limits are in US dollars.
        {counts.display === null ? '' : ` The ${counts.display.currency} figures are approximate.`}
      </p>
      {counts.routes.length === 0 ? (
        <p className={muted}>No model route counts spending here.</p>
      ) : null}
      {counts.providers.map((provider) => (
        <article
          aria-label={`provider ${provider.provider}`}
          className={routeCard}
          key={provider.provider}
        >
          <h2>Provider {provider.provider}</h2>
          <CountLines
            counts={counts}
            day={provider.day}
            month={provider.month}
            target={{ provider: provider.provider }}
          />
          {counts.routes
            .filter((route) => route.provider === provider.provider)
            .map((route) => (
              <RouteCard counts={counts} key={route.route} route={route} />
            ))}
        </article>
      ))}
      {counts.routes
        .filter(
          (route) => !counts.providers.some((provider) => provider.provider === route.provider),
        )
        .map((route) => (
          <RouteCard counts={counts} key={route.route} route={route} />
        ))}
    </section>
  );
}

interface CountLinesProps {
  readonly counts: SpendCountsRead;
  readonly day: SpendPeriodCount;
  readonly month: SpendPeriodCount;
  readonly target: { readonly route: string } | { readonly provider: string };
}

function CountLines(props: CountLinesProps): ReactNode {
  const display = props.counts.display;

  return (
    <div>
      <PeriodLine count={props.day} display={display} label="Today" />
      <ResetCount count={props.day} period="day" target={props.target} />
      <PeriodLine count={props.month} display={display} label="This month" />
      <ResetCount count={props.month} period="month" target={props.target} />
    </div>
  );
}

interface PeriodLineProps {
  readonly label: string;
  readonly count: SpendPeriodCount;
  readonly display: SpendDisplay | null;
}

function PeriodLine(props: PeriodLineProps): ReactNode {
  const count = props.count;
  const spent = formatSpendAmount(count.dollars, props.display);

  const limit =
    count.limit === null
      ? 'no limit of its own'
      : `of ${formatSpendAmount(count.limit, props.display)}`;

  return (
    <p>
      {props.label}: {spent} {limit}
      {count.tripped ? ' (limit reached)' : ''}
    </p>
  );
}

interface ResetCountProps {
  readonly count: SpendPeriodCount;
  readonly period: 'day' | 'month';
  readonly target: { readonly route: string } | { readonly provider: string };
}

// A reset sets the count of the period to zero, for a count that a restart or a mistake left too
// high. One confirm is the whole approval.
function ResetCount(props: ResetCountProps): ReactNode {
  const reset = useSpendSetCount();
  const [isOpen, setIsOpen] = useState(false);
  const name = 'route' in props.target ? props.target.route : props.target.provider;
  const label = props.period === 'day' ? 'today' : 'this month';

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true);
        }}
        type="button"
      >
        Reset {label} for {name}
      </button>
    );
  }

  const answer = reset.data;

  return (
    <div>
      <button
        disabled={reset.isPending}
        onClick={() => {
          reset.mutate({
            ...props.target,
            period: props.period,
            start: props.count.start,
            dollars: 0,
          });
        }}
        type="button"
      >
        Confirm reset {label} for {name}
      </button>
      {reset.isError ? <p role="alert">The reset did not finish. Try again.</p> : null}
      {answer !== undefined && 'error' in answer ? (
        <p role="alert">{describeResetRefusal(answer.error)}</p>
      ) : null}
    </div>
  );
}

function describeResetRefusal(error: string): string {
  if (error === 'period_ended') {
    return 'That period ended, so its count started again on its own.';
  }

  if (error === 'unreachable') {
    return 'nixie could not reach the spending gateway, so nothing changed. Try again when it answers.';
  }

  return 'The spending gateway holds no such route or provider.';
}

type RouteCount = SpendCountsRead['routes'][number];

interface RouteCardProps {
  readonly route: RouteCount;
  readonly counts: SpendCountsRead;
}

function RouteCard(props: RouteCardProps): ReactNode {
  const route = props.route;

  return (
    <article className={routeCard}>
      <h3>{route.route}</h3>
      <CountLines
        counts={props.counts}
        day={route.day}
        month={route.month}
        target={{ route: route.route }}
      />
    </article>
  );
}
