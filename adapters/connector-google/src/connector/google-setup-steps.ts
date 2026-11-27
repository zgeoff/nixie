import type { SetupStep } from '@heynixie/connections';

const consoleURL = 'https://console.cloud.google.com';

// The steps the web client shows, in order. `docs/guides/google.md` holds the same steps under the
// same titles, and a step's id names its section there.
export const googleSetupSteps: readonly SetupStep[] = [
  {
    id: 'project',
    title: 'Create a Google Cloud project',
    body: 'Create one project for this nixie alone. A revocation reaches every client of a project, so one deployment’s revocation would end another deployment’s grant.',
    links: [{ label: 'Create a project', url: `${consoleURL}/projectcreate` }],
  },
  {
    id: 'apis',
    title: 'Turn on the APIs',
    body: 'Enable the Gmail, Google Calendar, Google Drive and Google Picker APIs.',
    links: [
      { label: 'Gmail API', url: `${consoleURL}/apis/library/gmail.googleapis.com` },
      {
        label: 'Google Calendar API',
        url: `${consoleURL}/apis/library/calendar-json.googleapis.com`,
      },
      { label: 'Google Drive API', url: `${consoleURL}/apis/library/drive.googleapis.com` },
      { label: 'Google Picker API', url: `${consoleURL}/apis/library/picker.googleapis.com` },
    ],
  },
  {
    id: 'branding',
    title: 'Fill in the branding',
    body: 'Give an app name, your email, and a home page and a privacy policy URL on a domain you control. Publishing needs both URLs.',
    links: [{ label: 'Branding', url: `${consoleURL}/auth/branding` }],
  },
  {
    id: 'audience',
    title: 'Publish the app',
    body: 'Choose External, then publish to production with no test users. In testing status, Google ends each consent after 7 days.',
    links: [{ label: 'Audience', url: `${consoleURL}/auth/audience` }],
  },
  {
    id: 'client',
    title: 'Create a web client',
    body: 'Create a Web application client with {redirectURI} as its only redirect URI and {origin} as its JavaScript origin. Create an API key restricted to the Picker API, with {origin} and https://docs.google.com/* as its websites. Paste the client ID, the secret, the key and the project number here.',
    links: [
      { label: 'Clients', url: `${consoleURL}/auth/clients` },
      { label: 'API keys', url: `${consoleURL}/apis/credentials` },
    ],
    input: 'oauth_client',
  },
  {
    id: 'consent',
    title: 'Connect an account',
    body: 'Consent on Google’s page. An account that does not own the project sees “Google hasn’t verified this app” first.',
    links: [],
  },
];
