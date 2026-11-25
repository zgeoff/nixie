import type { ReactNode } from 'react';
import { formatSpendAmount } from '../spend/format-spend-amount';
import type { SpendDisplay } from '../spend/format-spend-amount';
import { useSpendCounts } from '../spend/use-spend-counts';
import { css } from '../styled-system/css';
import type { SpendPeriodCount } from '../types';

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
      {counts.routes.map((route) => (
        <article className={routeCard} key={route.route}>
          <h2>{route.route}</h2>
          <PeriodLine count={route.day} display={counts.display} label="Today" />
          <PeriodLine count={route.month} display={counts.display} label="This month" />
        </article>
      ))}
    </section>
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
    count.limit === null ? 'no limit' : `of ${formatSpendAmount(count.limit, props.display)}`;

  return (
    <p>
      {props.label}: {spent} {limit}
      {count.tripped ? ' (limit reached)' : ''}
    </p>
  );
}
