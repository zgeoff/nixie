import type { FeatureID } from '@heynixie/contract';
import type { ReactNode } from 'react';
import { FeatureOffPage } from './feature-off-page';
import { isFeatureOn } from './is-feature-on';
import { useFeatures } from './use-features';

export interface FeatureGateProps {
  readonly feature: FeatureID;
  readonly children: ReactNode;
}

// Shows the page of a feature, or the page that says the feature is off in this nixie.
export function FeatureGate(props: FeatureGateProps): ReactNode {
  const features = useFeatures();

  return isFeatureOn(features, props.feature) ? (
    props.children
  ) : (
    <FeatureOffPage feature={props.feature} />
  );
}
