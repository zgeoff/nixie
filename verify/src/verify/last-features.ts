import { featurePaths } from './feature-paths';

// The features that use a device or a second tab, which the registry lists after the others.
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
    summary: 'Pause in one tab, see it in another',
    paths: featurePaths['live-updates'],
  },
] as const;
