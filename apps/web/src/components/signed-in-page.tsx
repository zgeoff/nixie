import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { writeTakeOverRequest } from '../computer/write-take-over-request';
import type { SessionState } from '../conversation/read-session-state';
import { DeviceConnection } from '../device/device-connection';
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
      <DeviceConnection />
      <BackupNotice />
      <ForgetStuckNotice />
      <PauseBanner />
      <HandoverBanner
        onTakeOver={() => {
          writeTakeOverRequest();

          globalThis.location.assign('/computer');
        }}
      />
      <SpendStopNotice />
      {props.children}
    </>
  );
}
