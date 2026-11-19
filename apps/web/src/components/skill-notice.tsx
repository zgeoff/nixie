import type { ReactNode } from 'react';
import type { LiveRecord } from '../conversation/use-live-records';
import { css } from '../styled-system/css';

export interface SkillNoticeProps {
  readonly notice: NonNullable<LiveRecord['skillNotice']>;
}

const quiet = css({ color: 'textMuted', fontSize: 'sm' });

// A version is a 64-character hash, so the notice shows its first 12 characters, as a commit does.
const versionLength = 12;

export function SkillNotice(props: SkillNoticeProps): ReactNode {
  const notice = props.notice;
  const version = notice.skillHash.slice(0, versionLength);
  const what = notice.isNew ? 'the new skill' : 'a new version of the skill';

  return (
    <li className={quiet} role="note">
      nixie saved {what} {notice.name}, version {version}, under your rule {notice.ruleID}.
    </li>
  );
}
