import type { FeatureID } from '@heynixie/contract';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';

const page = css({ display: 'flex', flexDirection: 'column', gap: '2', padding: '4' });

export interface FeatureOffPageProps {
  readonly feature: FeatureID;
}

export function FeatureOffPage(props: FeatureOffPageProps): ReactNode {
  return (
    <main className={page}>
      <h1 className={css({ fontSize: 'lg', fontWeight: 'semibold' })}>
        This feature is off in this nixie
      </h1>
      <p>
        The {props.feature} feature is not set up here, so there is nothing to show. Add its section
        to the deployment config to turn it on.
      </p>
    </main>
  );
}
