import { expect, test } from 'bun:test';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNixieClient } from '../use-nixie-client';
import { createDeviceSession } from './create-device-session';
import { render } from './render';

function SessionCount(): ReactNode {
  const nixie = useNixieClient();
  const sessions = useQuery(nixie.queryUtils.sessions.list.queryOptions());

  return <p>{sessions.isSuccess ? `${sessions.data.sessions.length} session` : sessions.status}</p>;
}

test('it gives the view a client that reaches the mock API', async () => {
  await createDeviceSession();

  const rendered = render(<SessionCount />);
  const count = await rendered.findByText('1 session');

  expect(count).toBeInTheDocument();
});

test('it shows a refused query at once, with no retry', async () => {
  const rendered = render(<SessionCount />);
  const status = await rendered.findByText('error', undefined, { timeout: 500 });

  expect(status).toBeInTheDocument();
});
