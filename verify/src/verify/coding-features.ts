import { featureFiles } from './feature-files';

// The features that follow a coding session after it starts, which the registry lists after the
// coding session.
export const codingFeatures = [
  {
    name: 'coding-supervision',
    summary: 'Supervise a coding session',
    ...featureFiles['coding-supervision'],
  },
];
