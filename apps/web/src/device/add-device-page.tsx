import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';

const layout = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  marginInline: 'auto',
  maxWidth: 'md',
  padding: '4',
  '& button': { borderColor: 'borderStrong', borderWidth: '1px', paddingBlock: '2' },
});

const code = css({ fontFamily: 'mono', fontSize: '2xl' });

// Issues the one-time code that enrols a device, which shows pictures on a screen and reaches only
// its own stream. The device opens the page /device and types the code in.
export function AddDevicePage(): ReactNode {
  const nixie = useNixieClient();
  const issue = useMutation(nixie.queryUtils.sessions.issueCode.mutationOptions());

  return (
    <main className={layout}>
      <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>Add a device</h1>
      <p>
        Open the page /device in the browser of the device, and type the code there. The code works
        once.
      </p>
      <button
        disabled={issue.isPending}
        onClick={() => {
          issue.mutate({ clientActionID: crypto.randomUUID(), scope: 'device' });
        }}
        type="button"
      >
        Get a code
      </button>
      {issue.data === undefined ? null : (
        <p aria-label="Enrolment code" className={code}>
          {issue.data.code}
        </p>
      )}
      {issue.isError ? <p role="alert">The code did not come. Try again.</p> : null}
    </main>
  );
}
