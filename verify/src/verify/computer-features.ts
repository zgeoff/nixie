import { featureFiles } from './feature-files';

// The features that use the assistant's computer, which the registry lists after the notebook.
export const computerFeatures = [
  {
    name: 'computer-shell',
    summary: 'Write and read back a shell file',
    ...featureFiles['computer-shell'],
  },
  {
    name: 'computer-browser',
    summary: "Open a page in the assistant's browser",
    ...featureFiles['computer-browser'],
  },
  {
    name: 'computer-screen',
    summary: "Click a point of the assistant's desktop",
    ...featureFiles['computer-screen'],
  },
  {
    name: 'computer-watch',
    summary: "Watch the assistant's desktop",
    ...featureFiles['computer-watch'],
  },
  {
    name: 'computer-off',
    summary: 'Turn the computer off',
    ...featureFiles['computer-off'],
  },
  {
    name: 'trusted-places',
    summary: 'Trust a site once',
    ...featureFiles['trusted-places'],
  },
  {
    name: 'place-trust-card',
    summary: 'Trust a place from a card',
    ...featureFiles['place-trust-card'],
  },
] as const;
