import { featurePaths } from './feature-paths';

// The features that use a device, a second client, the assistant's own mailbox or Gmail, which the
// registry lists after the others.
export const lastFeatures = [
  {
    name: 'device-in-browser',
    summary: 'Make a signed-in browser a device',
    paths: featurePaths['device-in-browser'],
  },
  {
    name: 'device-screen',
    summary: 'Enrol a device and see a picture on it',
    paths: featurePaths['device-screen'],
  },
  {
    name: 'device-layout',
    summary: 'Lay out a screen in regions, and change them',
    paths: featurePaths['device-layout'],
  },
  {
    name: 'live-updates',
    summary: 'Pause from the host, see it on the page',
    paths: featurePaths['live-updates'],
  },
  {
    name: 'mail-wake',
    summary: 'Mail wakes the chat',
    paths: featurePaths['mail-wake'],
  },
  {
    name: 'gmail-tools',
    summary: 'Search and read a mail, and approve the reply the assistant writes',
    paths: featurePaths['gmail-tools'],
  },
] as const;
