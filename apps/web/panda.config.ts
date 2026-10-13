import { defineConfig } from '@pandacss/dev';
import { themePalette } from './src/theme-palette';

// Panda's own presets with nixie's colours on top: the client styles only what usability needs,
// such as widths, spacing, the pinned composer, and a light and a dark theme. The theme follows
// the data-theme attribute that the document's head script sets on <html> before the first paint.
export default defineConfig({
  conditions: { extend: { dark: '[data-theme=dark] &' } },
  exclude: ['./src/styled-system/**'],
  globalCss: {
    // the reset borders every element in this colour, so a bare borderWidth needs no colour
    html: { colorScheme: 'light', '--global-color-border': '{colors.border}' },
    '[data-theme=dark]': { colorScheme: 'dark' },
    body: { backgroundColor: 'canvas', color: 'text' },
  },
  include: ['./src/**/*.{ts,tsx}'],
  jsxFramework: 'react',
  outdir: 'src/styled-system',
  preflight: true,
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  shorthands: false,
  theme: {
    extend: {
      semanticTokens: {
        colors: Object.fromEntries(
          Object.entries(themePalette).map(([name, colours]) => [
            name,
            { value: { _dark: colours.dark, base: colours.light } },
          ]),
        ),
      },
    },
  },
});
