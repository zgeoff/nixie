import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import { css } from '../styled-system/css';
import type { SetupReading } from '../types';
import { useNixieClient } from '../utils/use-nixie-client';
import { ClientForm } from './client-form';
import { ConnectButton } from './connect-button';
import { RegisteredClient } from './registered-client';

const list = css({ display: 'flex', flexDirection: 'column', gap: '4', paddingInlineStart: '5' });
const stepTitle = css({ fontWeight: 'semibold' });
const links = css({ display: 'flex', flexWrap: 'wrap', gap: '3', marginBlock: '1' });
const link = css({ color: 'link', textDecoration: 'underline' });

// The setup steps in order, from the connector's data. The page's own origin fills the placeholders
// until a client is registered, so the steps read after hydration, when the browser knows it.
export function SetupSteps(): ReactNode {
  const nixie = useNixieClient();
  const isHydrated = useIsHydrated();

  const setup = useQuery({
    ...nixie.queryUtils.connections.readSetup.queryOptions({
      input: {
        connector: 'google',
        origin: isHydrated ? globalThis.location.origin : 'https://nixie.invalid',
      },
    }),
    enabled: isHydrated,
  });

  if (setup.isError) {
    return <p role="alert">The setup steps did not load. Reload to try again.</p>;
  }

  if (!setup.isSuccess) {
    return <p>Reading the setup steps…</p>;
  }

  const client = setup.data.client;

  return (
    <ol aria-label="Setup steps" className={list}>
      {setup.data.steps.map((step) => (
        <li aria-label={step.title} key={step.id}>
          <p className={stepTitle}>{step.title}</p>
          <p>{step.body}</p>
          {step.links.length === 0 ? null : (
            <ul className={links}>
              {step.links.map((item) => (
                <li key={item.url}>
                  <a className={link} href={item.url} rel="noreferrer" target="_blank">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {step.input === 'oauth_client' ? <ClientStep client={client} /> : null}
          {step.id === 'consent' ? (
            <ConnectButton
              connection={null}
              isDisabled={client === null}
              label="Connect a Google account"
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

interface ClientStepProps {
  readonly client: SetupReading['client'];
}

function ClientStep(props: ClientStepProps): ReactNode {
  if (props.client === null) {
    return <ClientForm />;
  }

  return <RegisteredClient client={props.client} />;
}
