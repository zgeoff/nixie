import { ORPCError } from '@orpc/client';
import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';
import { ThemePicker } from './theme-picker';

export interface EnrolFormProps {
  readonly onEnrolled: () => void;
}

interface Attempt {
  readonly clientActionID: string;
  readonly code: string;
  readonly deviceName: string;
}

// A narrow column with one field per line, so the form reads on a phone.
const page = css({
  marginInline: 'auto',
  maxWidth: 'md',
  padding: '4',
  '& > label': { marginBottom: '4' },
});

const heading = css({ fontSize: 'xl', fontWeight: 'bold', marginBottom: '4' });

const fields = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  '& input': {
    backgroundColor: 'surface',
    borderColor: 'borderStrong',
    borderWidth: '1px',
    display: 'block',
    padding: '2',
    width: 'full',
  },
  '& button': { borderColor: 'borderStrong', borderWidth: '1px', paddingBlock: '2' },
});

// Turns an enrolment code into a device session. The API's response sets the session cookie, and
// the form never touches it.
export function EnrolForm(props: EnrolFormProps): ReactNode {
  const nixie = useNixieClient();
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('Browser');
  const lastAttempt = useRef<Attempt | undefined>(undefined);

  const enrol = useMutation(
    nixie.queryUtils.sessions.enrol.mutationOptions({ onSuccess: props.onEnrolled }),
  );

  return (
    <main className={page}>
      <ThemePicker />
      <h1 className={heading}>Enrol this browser</h1>
      <form
        className={fields}
        onSubmit={(event) => {
          event.preventDefault();

          lastAttempt.current = buildAttempt(lastAttempt.current, code.trim(), deviceName);

          enrol.mutate({ ...lastAttempt.current, tokenDelivery: 'cookie' });
        }}
      >
        <label>
          Enrolment code
          <input
            autoComplete="one-time-code"
            onChange={(event) => {
              setCode(event.target.value);
            }}
            required
            value={code}
          />
        </label>
        <label>
          Device name
          <input
            onChange={(event) => {
              setDeviceName(event.target.value);
            }}
            required
            value={deviceName}
          />
        </label>
        <button disabled={enrol.isPending} type="submit">
          Enrol
        </button>
      </form>
      {enrol.isError ? <p role="alert">{formatEnrolError(enrol.error)}</p> : null}
    </main>
  );
}

// A retry of the same code and name keeps its client action ID, so the API enrols the browser
// once. A changed input is a new action with a new ID.
function buildAttempt(last: Attempt | undefined, code: string, deviceName: string): Attempt {
  if (last?.code === code && last.deviceName === deviceName) {
    return last;
  }

  return { clientActionID: crypto.randomUUID(), code, deviceName };
}

function formatEnrolError(error: Readonly<Error>): string {
  if (error instanceof ORPCError && error.code === 'ENROLMENT_CODE_INVALID') {
    return 'That code is unknown, used or lapsed. Ask nixie for a new one.';
  }

  return 'Enrolment failed. Try again.';
}
