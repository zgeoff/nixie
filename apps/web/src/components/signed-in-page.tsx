import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { SessionState } from '../conversation/read-session-state';
import { BackupNotice } from './backup-notice';
import { EnrolForm } from './enrol-form';
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
      <BackupNotice />
      <PauseBanner />
      <HandoverBanner
        onTakeOver={() => {
          globalThis.location.assign('/computer?takeOver=true');
        }}
      />
      <SpendStopNotice />
      {props.children}
    </>
  );
}
