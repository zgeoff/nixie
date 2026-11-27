import { featurePaths } from './feature-paths';

// The features that use a device, a second client, the assistant's own mailbox or Gmail, which the
// registry lists after the others.
export const lastFeatures = [
  {
    name: 'spend-routes',
    summary: "Read each route's counts",
    paths: featurePaths['spend-routes'],
  },
  {
    name: 'device-in-browser',
    summary: "Open the browser's own device full screen",
    paths: featurePaths['device-in-browser'],
  },
  {
    name: 'device-view',
    summary: "Open the browser's own device",
    paths: featurePaths['device-view'],
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
    name: 'phone-text',
    summary: 'A text wakes the chat',
    paths: featurePaths['phone-text'],
  },
  {
    name: 'gmail-tools',
    summary: 'Search and read a mail, and approve a reply',
    paths: featurePaths['gmail-tools'],
  },
  {
    name: 'gmail-wake',
    summary: 'A matching Gmail mail wakes the chat',
    paths: featurePaths['gmail-wake'],
  },
  {
    name: 'calendar-tools',
    summary: 'Read the calendar, and approve an invitation the assistant writes',
    paths: featurePaths['calendar-tools'],
  },
  {
    name: 'drive-tools',
    summary: 'Search the files, and create a text file',
    paths: featurePaths['drive-tools'],
  },
] as const;
