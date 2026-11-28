import { featureFiles } from './feature-files';

// The features that use a device, a second client, the assistant's own mailbox or Gmail, which the
// registry lists after the others.
export const lastFeatures = [
  {
    name: 'job-skills',
    summary: 'Give a job its skills',
    ...featureFiles['job-skills'],
  },
  {
    name: 'calls-off',
    summary: 'Turn calls off',
    ...featureFiles['calls-off'],
  },
  {
    name: 'devices-off',
    summary: 'Turn devices off',
    ...featureFiles['devices-off'],
  },
  {
    name: 'search-images-off',
    summary: 'Turn search and images off',
    ...featureFiles['search-images-off'],
  },
  {
    name: 'spend-routes',
    summary: "Read each route's counts",
    ...featureFiles['spend-routes'],
  },
  {
    name: 'device-in-browser',
    summary: "Open the browser's own device full screen",
    ...featureFiles['device-in-browser'],
  },
  {
    name: 'device-view',
    summary: "Open the browser's own device",
    ...featureFiles['device-view'],
  },
  {
    name: 'device-screen',
    summary: 'Enrol a device and see a picture on it',
    ...featureFiles['device-screen'],
  },
  {
    name: 'device-layout',
    summary: 'Lay out a screen in regions, and change them',
    ...featureFiles['device-layout'],
  },
  {
    name: 'live-updates',
    summary: 'Pause from the host, see it on the page',
    ...featureFiles['live-updates'],
  },
  {
    name: 'mail-wake',
    summary: 'Mail wakes the chat',
    ...featureFiles['mail-wake'],
  },
  {
    name: 'phone-text',
    summary: 'A text wakes the chat',
    ...featureFiles['phone-text'],
  },
  {
    name: 'gmail-tools',
    summary: 'Search and read a mail, and approve a reply',
    ...featureFiles['gmail-tools'],
  },
  {
    name: 'gmail-wake',
    summary: 'A matching Gmail mail wakes the chat',
    ...featureFiles['gmail-wake'],
  },
  {
    name: 'calendar-tools',
    summary: 'Read the calendar, and approve an invitation',
    ...featureFiles['calendar-tools'],
  },
  {
    name: 'drive-tools',
    summary: 'Search the files, and create a text file',
    ...featureFiles['drive-tools'],
  },
  {
    name: 'conversation-reset',
    summary: 'Reset the conversation from the host',
    ...featureFiles['conversation-reset'],
  },
] as const;
