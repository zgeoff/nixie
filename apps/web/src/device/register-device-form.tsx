import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';

export interface RegisterDeviceFormProps {
  readonly onRegistered: () => void;
}

interface Attempt {
  readonly clientActionID: string;
  readonly name: string;
}

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  marginInline: 'auto',
  maxWidth: 'md',
  padding: '4',
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

// Names this browser as a device on the session it already holds, so no code is needed and the
// session and its cookie stay as they are.
export function RegisterDeviceForm(props: RegisterDeviceFormProps): ReactNode {
  const nixie = useNixieClient();
  const [name, setName] = useState('Browser');
  const lastAttempt = useRef<Attempt | undefined>(undefined);

  const register = useMutation(
    nixie.queryUtils.devices.register.mutationOptions({ onSuccess: props.onRegistered }),
  );

  return (
    <main className={page}>
      <h1>Use this browser as a device</h1>
      <form
        className={page}
        onSubmit={(event) => {
          event.preventDefault();

          lastAttempt.current = buildAttempt(lastAttempt.current, name.trim());

          register.mutate(lastAttempt.current);
        }}
      >
        <label>
          Device name
          <input
            onChange={(event) => {
              setName(event.target.value);
            }}
            required
            value={name}
          />
        </label>
        <button disabled={register.isPending} type="submit">
          Register device
        </button>
      </form>
      {register.isError ? <p role="alert">Registration failed. Try again.</p> : null}
    </main>
  );
}

function buildAttempt(last: Attempt | undefined, name: string): Attempt {
  return last?.name === name ? last : { clientActionID: crypto.randomUUID(), name };
}
