import { featurePaths } from './feature-paths';

// The features that browse a page of what the assistant keeps, which the registry lists after the
// calls.
export const pageFeatures = [
  {
    name: 'drawing',
    summary: 'Draw a picture, edit it, and list both',
    paths: featurePaths.drawing,
  },
  {
    name: 'images-page',
    summary: 'Browse and forget images',
    paths: featurePaths['images-page'],
  },
  {
    name: 'notebook-pages',
    summary: 'Browse notes, open a private one, forget one',
    paths: featurePaths['notebook-pages'],
  },
  {
    name: 'google-connections',
    summary: 'Connect a Google account and forget it',
    paths: featurePaths['google-connections'],
  },
  {
    name: 'google-off',
    summary: 'Turn Google off',
    paths: featurePaths['google-off'],
  },
  {
    name: 'mcp-servers',
    summary: 'Connect an MCP server, and approve a tool',
    paths: featurePaths['mcp-servers'],
  },
] as const;
