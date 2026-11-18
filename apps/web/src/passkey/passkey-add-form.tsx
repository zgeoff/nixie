import type { ReactNode } from 'react';
import { useState } from 'react';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import { css } from '../styled-system/css';
import { useAddPasskey } from './use-add-passkey';

const form = css({ maxWidth: 'md' });

const controls = css({
  border: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  margin: '0',
  minWidth: '0',
  padding: '0',
});

const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });

export interface PasskeyAddFormProps {
  // true while a live passkey exists, which can allow the new one in place of a code
  readonly hasLivePasskey: boolean;
}

// Adds a passkey with a one-time code from nixie passkey-code, or with a live passkey. The controls
// wait for hydration, because text typed into the server render is lost.
export function PasskeyAddForm(props: PasskeyAddFormProps): ReactNode {
  const adder = useAddPasskey();
  const isHydrated = useIsHydrated();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');

  return (
    <form
      aria-label="Add a passkey"
      className={form}
      onSubmit={(event) => {
        event.preventDefault();
        adder.add({ code: code.trim() === '' ? null : code.trim(), label });
      }}
    >
      <fieldset className={controls} disabled={!isHydrated}>
        <label className={field}>
          Label (optional)
          <input
            maxLength={64}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
            value={label}
          />
        </label>
        <label className={field}>
          Code from nixie passkey-code
          <input
            autoComplete="off"
            onChange={(event) => {
              setCode(event.target.value);
            }}
            value={code}
          />
        </label>
        <button
          disabled={adder.isPending || (code.trim() === '' && !props.hasLivePasskey)}
          type="submit"
        >
          {code.trim() === '' ? 'Add with a passkey' : 'Add with the code'}
        </button>
        {adder.message === null ? null : <p role="alert">{adder.message}</p>}
        {adder.isAdded ? <p role="status">The passkey was added.</p> : null}
      </fieldset>
    </form>
  );
}
