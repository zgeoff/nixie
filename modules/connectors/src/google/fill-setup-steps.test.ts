import { expect, test } from 'bun:test';
import { fillSetupSteps } from './fill-setup-steps';
import { googleSetupSteps } from './google-setup-steps';

test('it puts the redirect URI and the origin in the client step, and leaves the other steps as they are', () => {
  const filled = fillSetupSteps(googleSetupSteps, {
    redirectURI: 'https://nixie.example.org/connections/google/return',
    origin: 'https://nixie.example.org',
  });

  const client = filled.find((step) => step.id === 'client');

  expect(client?.body).toBe(
    'Create a Web application client with https://nixie.example.org/connections/google/return as its only redirect URI and https://nixie.example.org as its JavaScript origin. Create an API key restricted to the Picker API, with https://nixie.example.org and https://docs.google.com/* as its websites. Paste the client ID, the secret, the key and the project number here.',
  );

  expect(filled.filter((step) => step.id !== 'client')).toStrictEqual(
    googleSetupSteps.filter((step) => step.id !== 'client'),
  );
});

test('it lists the 6 steps in the order the guide holds them', () => {
  expect(googleSetupSteps.map((step) => step.id)).toStrictEqual([
    'project',
    'apis',
    'branding',
    'audience',
    'client',
    'consent',
  ]);
});
