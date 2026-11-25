import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { describeConnectionError } from './describe-connection-error';
import { useActionID } from './use-action-id';

const controls = css({
  border: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  margin: '0',
  maxWidth: 'md',
  minWidth: '0',
  padding: '0',
});

const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });

// Registers the OAuth client the owner made in Google Cloud. The secret leaves the field once the
// call answers, and nothing on the page shows it again. The controls wait for hydration, because
// text typed into the server render is lost.
export function ClientForm(): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const isHydrated = useIsHydrated();
  const action = useActionID();
  const [clientID, setClientID] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [pickerKey, setPickerKey] = useState('');
  const [projectNumber, setProjectNumber] = useState('');

  const register = useMutation({
    mutationFn: () =>
      nixie.client.connections.registerClient({
        clientActionID: action.id,
        connector: 'google',
        clientID: clientID.trim(),
        clientSecret: clientSecret.trim(),
        origin: globalThis.location.origin,
        ...(pickerKey.trim() === '' ? {} : { pickerKey: pickerKey.trim() }),
        ...(projectNumber.trim() === '' ? {} : { projectNumber: projectNumber.trim() }),
      }),
    onSuccess: () => {
      setClientSecret('');
    },
    onSettled: (_result, error) => {
      action.settle(error);

      return queryClient.invalidateQueries({ queryKey: nixie.queryUtils.connections.key() });
    },
  });

  return (
    <form
      aria-label="Register the OAuth client"
      onSubmit={(event) => {
        event.preventDefault();
        register.mutate();
      }}
    >
      <fieldset className={controls} disabled={!isHydrated || register.isPending}>
        <label className={field}>
          Client ID
          <input
            autoComplete="off"
            onChange={(event) => {
              setClientID(event.target.value);
            }}
            required
            value={clientID}
          />
        </label>
        <label className={field}>
          Client secret
          <input
            autoComplete="off"
            onChange={(event) => {
              setClientSecret(event.target.value);
            }}
            required
            type="password"
            value={clientSecret}
          />
        </label>
        <label className={field}>
          Picker API key (optional)
          <input
            autoComplete="off"
            onChange={(event) => {
              setPickerKey(event.target.value);
            }}
            value={pickerKey}
          />
        </label>
        <label className={field}>
          Project number (optional)
          <input
            autoComplete="off"
            inputMode="numeric"
            onChange={(event) => {
              setProjectNumber(event.target.value);
            }}
            value={projectNumber}
          />
        </label>
        <button type="submit">Register the client</button>
        {register.isError ? <p role="alert">{describeConnectionError(register.error)}</p> : null}
      </fieldset>
    </form>
  );
}
