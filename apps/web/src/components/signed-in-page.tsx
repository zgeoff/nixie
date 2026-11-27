import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { writeTakeOverRequest } from '../computer/write-take-over-request';
import type { SessionState } from '../conversation/read-session-state';
import { DeviceLeaderConnection } from '../device/device-leader-connection';
import { isFeatureOn } from '../features/is-feature-on';
import { useFeatures } from '../features/use-features';
import { LiveConnection } from '../live/live-connection';
import { BackupNotice } from './backup-notice';
import { EnrolForm } from './enrol-form';
import { ForgetStuckNotice } from './forget-stuck-notice';
import { HandoverBanner } from './handover-banner';
import { PauseBanner } from './pause-banner';
import { SpendStopNotice } from './spend-stop-notice';

export interface SignedInPageProps {
  readonly session: SessionState;

  readonly onRefresh: () => void;
  readonly children: ReactNode;
}

export function SignedInPage(props: SignedInPageProps): ReactNode {
  const onRefresh = props.onRefresh;
  const features = useFeatures();

  useEffect(() => {
    if (props.session === 'unchecked') {
      onRefresh();
    }
  }, [props.session, onRefresh]);

  if (props.session === 'unchecked') {
    return null;
  }

  if (props.session === 'none') {
    return <EnrolForm onEnrolled={onRefresh} />;
  }

  return (
    <>
      <LiveConnection />
      {isFeatureOn(features, 'devices') && <DeviceLeaderConnection />}
      <BackupNotice />
      <ForgetStuckNotice />
      <PauseBanner />
      {features?.includes('computer') === true && (
        <HandoverBanner
          onTakeOver={() => {
            writeTakeOverRequest();

            globalThis.location.assign('/computer');
          }}
        />
      )}
      <SpendStopNotice />
      {props.children}
    </>
  );
}
