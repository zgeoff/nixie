import { expect, test } from 'bun:test';
import { fillSetupSteps } from './fill-setup-steps';

test('it puts the redirect URI and the origin in the step bodies, and leaves the rest of each step as it is', () => {
  const steps = [
    {
      id: 'client',
      title: 'Create a client',
      body: 'Use {redirectURI} as the redirect URI and {origin} as the origin.',
      links: [{ label: 'Console', url: 'https://console.example.org' }],
      input: 'oauth_client' as const,
    },
    { id: 'other', title: 'Other', body: 'Nothing to fill.', links: [] },
  ];

  expect(
    fillSetupSteps(steps, {
      redirectURI: 'https://nixie.example.org/connections/example/return',
      origin: 'https://nixie.example.org',
    }),
  ).toStrictEqual([
    {
      id: 'client',
      title: 'Create a client',
      body: 'Use https://nixie.example.org/connections/example/return as the redirect URI and https://nixie.example.org as the origin.',
      links: [{ label: 'Console', url: 'https://console.example.org' }],
      input: 'oauth_client',
    },
    { id: 'other', title: 'Other', body: 'Nothing to fill.', links: [] },
  ]);
});
