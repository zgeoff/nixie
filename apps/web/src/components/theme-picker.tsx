import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { ThemeChoice } from '../use-theme-choice';
import { useThemeChoice } from '../use-theme-choice';

// Picks the theme for this device: the system's, or light or dark whatever the system says.
export function ThemePicker(): ReactNode {
  const theme = useThemeChoice();

  return (
    <label className={picker}>
      Theme{' '}
      <select
        className={select}
        onChange={(event) => {
          theme.setChoice(toThemeChoice(event.target.value));
        }}
        value={theme.choice}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

// The picker sits on its own line at the end of its row.
const picker = css({ color: 'textMuted', display: 'block', fontSize: 'sm', textAlign: 'end' });

const select = css({
  backgroundColor: 'canvas',
  borderColor: 'borderStrong',
  borderRadius: 'sm',
  borderWidth: '1px',
  color: 'text',
  paddingInline: '1',
});

function toThemeChoice(value: string): ThemeChoice {
  return value === 'dark' || value === 'light' ? value : 'system';
}
