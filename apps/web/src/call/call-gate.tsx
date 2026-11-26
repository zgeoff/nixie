import type { ReactNode } from 'react';
import { isFeatureOn } from '../features/is-feature-on';
import { useFeatures } from '../features/use-features';
import { CallProvider } from './call-provider';

export interface CallGateProps {
  readonly children: ReactNode;
}

// Turns the call provider off while the voice feature is off.
export function CallGate(props: CallGateProps): ReactNode {
  const features = useFeatures();

  return <CallProvider isOn={isFeatureOn(features, 'voice')}>{props.children}</CallProvider>;
}
