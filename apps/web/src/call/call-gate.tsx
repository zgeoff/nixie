import type { ReactNode } from 'react';
import { isFeatureOn } from '../features/is-feature-on';
import { useFeatures } from '../features/use-features';
import { CallProvider } from './call-provider';

export interface CallGateProps {
  readonly children: ReactNode;
}

// Mounts the call provider only while the voice feature is on.
export function CallGate(props: CallGateProps): ReactNode {
  const features = useFeatures();

  return isFeatureOn(features, 'voice') ? (
    <CallProvider>{props.children}</CallProvider>
  ) : (
    props.children
  );
}
