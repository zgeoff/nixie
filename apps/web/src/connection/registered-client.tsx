import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import { css } from '../styled-system/css';
import type { SetupReading } from '../types';
import { useNixieClient } from '../utils/use-nixie-client';
import { describeConnectionError } from './describe-connection-error';
import { useActionID } from './use-action-id';

export interface RegisteredClientProps {
  readonly client: NonNullable<SetupReading['client']>;
}

const facts = css({ display: 'grid', gap: '1', gridTemplateColumns: 'max-content 1fr' });
const term = css({ color: 'textMuted' });

// The registered client: what Google checks it against, the picker's two public values, and a way
// to remove it. The secret never comes back from nixie, so only its fingerprint shows.
export function RegisteredClient(props: RegisteredClientProps): ReactNode {
  const client = props.client;

  return (
    <section aria-label="Registered OAuth client">
      <dl className={facts}>
        <dt className={term}>Redirect URI</dt>
        <dd>{client.redirectURI}</dd>
        <dt className={term}>Origin</dt>
        <dd>{client.origin}</dd>
        <dt className={term}>Secret fingerprint</dt>
        <dd>{client.fingerprint}</dd>
        <dt className={term}>Picker key</dt>
        <dd>{client.pickerKey ?? 'none'}</dd>
        <dt className={term}>Project number</dt>
        <dd>{client.projectNumber ?? 'none'}</dd>
      </dl>
      <PickerForm client={client} key={`${client.pickerKey}/${client.projectNumber}`} />
      <RemoveClient client={client.client} />
    </section>
  );
}

const row = css({ display: 'flex', flexWrap: 'wrap', gap: '2', marginTop: '2' });

function PickerForm(props: RegisteredClientProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const isHydrated = useIsHydrated();
  const action = useActionID();
  const [pickerKey, setPickerKey] = useState(props.client.pickerKey ?? '');
  const [projectNumber, setProjectNumber] = useState(props.client.projectNumber ?? '');

  const save = useMutation({
    mutationFn: (isRemoval: boolean) =>
      nixie.client.connections.setPicker({
        clientActionID: action.id,
        client: props.client.client,
        pickerKey: isRemoval ? null : pickerKey.trim(),
        projectNumber: isRemoval ? null : projectNumber.trim(),
      }),
    onSuccess: () => {
      action.renew();
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: nixie.queryUtils.connections.key() }),
  });

  return (
    <form
      aria-label="Picker settings"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(false);
      }}
    >
      <fieldset
        className={css({ border: 'none', margin: '0', padding: '0' })}
        disabled={!isHydrated}
      >
        <div className={row}>
          <label>
            Picker API key{' '}
            <input
              autoComplete="off"
              onChange={(event) => {
                setPickerKey(event.target.value);
              }}
              value={pickerKey}
            />
          </label>
          <label>
            Project number{' '}
            <input
              autoComplete="off"
              inputMode="numeric"
              onChange={(event) => {
                setProjectNumber(event.target.value);
              }}
              value={projectNumber}
            />
          </label>
        </div>
        <div className={row}>
          <button disabled={save.isPending} type="submit">
            Save the picker settings
          </button>
          <button
            disabled={save.isPending}
            onClick={() => {
              save.mutate(true);
            }}
            type="button"
          >
            Remove the picker settings
          </button>
        </div>
        {save.isError ? <p role="alert">{describeConnectionError(save.error)}</p> : null}
      </fieldset>
    </form>
  );
}

interface RemoveClientProps {
  readonly client: string;
}

function RemoveClient(props: RemoveClientProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const isHydrated = useIsHydrated();
  const action = useActionID();

  const remove = useMutation({
    mutationFn: () =>
      nixie.client.connections.removeClient({ clientActionID: action.id, client: props.client }),
    onSuccess: () => {
      action.renew();
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: nixie.queryUtils.connections.key() }),
  });

  return (
    <div className={row}>
      <button
        disabled={!isHydrated || remove.isPending}
        onClick={() => {
          remove.mutate();
        }}
        type="button"
      >
        Remove the client
      </button>
      {remove.isError ? <p role="alert">{describeConnectionError(remove.error)}</p> : null}
    </div>
  );
}
