import { featurePaths } from './feature-paths';

// The features that follow a coding session after it starts, which the registry lists after the
// coding session.
export const codingFeatures = [
  {
    name: 'coding-supervision',
    summary: 'Supervise a coding session',
    paths: featurePaths['coding-supervision'],
  },
];
