import { featurePaths } from './feature-paths';

// The features that use the assistant's computer, which the registry lists after the notebook.
export const computerFeatures = [
  {
    name: 'computer-shell',
    summary: 'Write and read back a shell file',
    paths: featurePaths['computer-shell'],
  },
  {
    name: 'computer-browser',
    summary: "Open a page in the assistant's browser",
    paths: featurePaths['computer-browser'],
  },
  {
    name: 'computer-screen',
    summary: "Click a point of the assistant's desktop",
    paths: featurePaths['computer-screen'],
  },
  {
    name: 'computer-watch',
    summary: "Watch the assistant's desktop",
    paths: featurePaths['computer-watch'],
  },
  {
    name: 'computer-off',
    summary: 'See that a nixie with no computer offers none',
    paths: featurePaths['computer-off'],
  },
  {
    name: 'trusted-places',
    summary: 'Trust a site once',
    paths: featurePaths['trusted-places'],
  },
] as const;
