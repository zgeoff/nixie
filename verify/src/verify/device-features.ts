import { featurePaths } from './feature-paths';

// The features that use a device, which the registry lists after the others.
export const deviceFeatures = [
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
    summary: 'Lay out a device screen in regions, update one and time another out',
    paths: featurePaths['device-layout'],
  },
] as const;
