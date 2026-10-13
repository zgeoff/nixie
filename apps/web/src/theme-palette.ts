// The colours of each theme. Panda turns them into colour tokens, and every text colour meets WCAG
// AA contrast on both backgrounds of its theme.
export const themePalette = {
  dark: {
    border: '#3f3f46',
    borderStrong: '#71717a',
    canvas: '#18181b',
    link: '#93c5fd',
    surface: '#27272a',
    text: '#f4f4f5',
    textMuted: '#a1a1aa',
  },
  light: {
    border: '#d4d4d8',
    borderStrong: '#71717a',
    canvas: '#ffffff',
    link: '#1d4ed8',
    surface: '#f4f4f5',
    text: '#18181b',
    textMuted: '#52525b',
  },
} as const;
