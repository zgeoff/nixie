import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildThemeScript } from '../build-theme-script';
import { render } from '../test-utils/render';
import { updateSystemColorScheme } from '../test-utils/update-system-color-scheme';
import { ThemePicker } from './theme-picker';

test('it follows the system setting when the device stores no choice', async () => {
  updateSystemColorScheme('dark');

  const rendered = render(<ThemePicker />);

  expect(rendered.getByRole('combobox', { name: 'Theme' })).toHaveValue('system');
  await waitFor(() => {
    expect(globalThis.document.documentElement.dataset['theme']).toBe('dark');
  });
});

test('it follows the system setting as it changes when the device stores no choice', async () => {
  render(<ThemePicker />);

  updateSystemColorScheme('dark');

  await waitFor(() => {
    expect(globalThis.document.documentElement.dataset['theme']).toBe('dark');
  });
});

test('it shows the chosen theme over the system setting', async () => {
  const user = userEvent.setup();

  updateSystemColorScheme('dark');
  const rendered = render(<ThemePicker />);

  await user.selectOptions(rendered.getByRole('combobox', { name: 'Theme' }), 'Light');

  await waitFor(() => {
    expect(globalThis.document.documentElement.dataset['theme']).toBe('light');
  });
});

test('it keeps the chosen theme after a reload', async () => {
  const user = userEvent.setup();
  const before = render(<ThemePicker />);

  await user.selectOptions(before.getByRole('combobox', { name: 'Theme' }), 'Dark');
  before.unmount();
  delete globalThis.document.documentElement.dataset['theme'];

  // a reload runs the head script before the page renders
  // oxlint-disable-next-line no-new-func -- runs the script's text as the browser would
  new Function(buildThemeScript())();
  const themeBeforeRender = globalThis.document.documentElement.dataset['theme'];
  const rendered = render(<ThemePicker />);

  expect(themeBeforeRender).toBe('dark');
  expect(rendered.getByRole('combobox', { name: 'Theme' })).toHaveValue('dark');
});

test('it follows the system setting again once you pick System', async () => {
  const user = userEvent.setup();

  updateSystemColorScheme('dark');
  const rendered = render(<ThemePicker />);
  const picker = rendered.getByRole('combobox', { name: 'Theme' });
  await user.selectOptions(picker, 'Light');

  await user.selectOptions(picker, 'System');

  await waitFor(() => {
    expect(globalThis.document.documentElement.dataset['theme']).toBe('dark');
  });
});
