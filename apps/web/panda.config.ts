import { defineConfig } from '@pandacss/dev';
import { themePalette } from './src/theme-palette';

export default defineConfig({
  conditions: { extend: { dark: '[data-theme=dark] &' } },
  exclude: ['./src/styled-system/**'],
  globalCss: {
    // Panda's reset borders every element in this colour, so a bare borderWidth needs no colour.
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
