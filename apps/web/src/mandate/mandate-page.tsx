import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { MandateForm } from './mandate-form';
import { MandateList } from './mandate-list';

export interface MandatePageProps {
  readonly navigation?: ReactNode;
}

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const header = css({ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' });
const heading = css({ fontSize: 'lg', fontWeight: 'bold', marginTop: '4' });

// The mandates: the ones in force, with End now, and the form that proposes a new one.
export function MandatePage(props: MandatePageProps): ReactNode {
  return (
    <main className={layout}>
      <header className={header}>
        <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>Mandates</h1>
        {props.navigation}
      </header>
      <p>
        A mandate lets nixie act under allow rules until it ends, at midnight by default and within
        24 hours at most.
      </p>
      <h2 className={heading}>In force</h2>
      <MandateList />
      <h2 className={heading}>Propose a mandate</h2>
      <MandateForm />
    </main>
  );
}
