import { featureFiles } from './feature-files';

// The features that browse a page of what the assistant keeps, which the registry lists after the
// calls.
export const pageFeatures = [
  {
    name: 'drawing',
    summary: 'Draw a picture, edit it, and list both',
    ...featureFiles.drawing,
  },
  {
    name: 'images-page',
    summary: 'Browse and forget images',
    ...featureFiles['images-page'],
  },
  {
    name: 'notebook-pages',
    summary: 'Browse notes, open a private one, forget one',
    ...featureFiles['notebook-pages'],
  },
  {
    name: 'google-connections',
    summary: 'Connect a Google account and forget it',
    ...featureFiles['google-connections'],
  },
  {
    name: 'google-off',
    summary: 'Turn Google off',
    ...featureFiles['google-off'],
  },
  {
    name: 'mcp-servers',
    summary: 'Connect an MCP server, and call its tool',
    ...featureFiles['mcp-servers'],
  },
] as const;
