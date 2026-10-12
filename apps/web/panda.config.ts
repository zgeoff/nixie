import { defineConfig } from '@pandacss/dev';
import presetBase from '@pandacss/preset-base';
import presetPanda from '@pandacss/preset-panda';

// Panda's own presets and nothing on top: the client styles only what usability needs, such as
// widths, spacing and the pinned composer, and carries no theme.
export default defineConfig({
  exclude: ['./src/styled-system/**'],
  include: ['./src/**/*.{ts,tsx}'],
  jsxFramework: 'react',
  outdir: 'src/styled-system',
  preflight: true,
  presets: [presetBase, presetPanda],
  shorthands: false,
});
