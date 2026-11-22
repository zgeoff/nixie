import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { chromeAccount, chromiumLauncherPath, screenAccount, terminalAccount } from './constants';

async function setupTest() {
  return { dockerfile: await Bun.file(join(import.meta.dir, '../../Dockerfile')).text() };
}

test.each([chromeAccount, terminalAccount, screenAccount])(
  'it creates the $name account in the image with the ids the guest uses',
  async (account) => {
    const ctx = await setupTest();

    expect(ctx.dockerfile).toInclude(`groupadd -g ${String(account.gid)} ${account.name}`);
    expect(ctx.dockerfile).toInclude(`useradd -u ${String(account.uid)} -g ${String(account.gid)}`);
    expect(ctx.dockerfile).toInclude(`-d ${account.home} -s`);
  },
);

test('it installs the launcher that drops Chromium to its own account', async () => {
  const ctx = await setupTest();

  expect(ctx.dockerfile).toInclude(
    `setpriv --reuid=${String(chromeAccount.uid)} --regid=${String(chromeAccount.gid)} --clear-groups`,
  );

  expect(ctx.dockerfile).toInclude(chromiumLauncherPath);
});

test('it keeps the three accounts apart, so none can signal or trace another', () => {
  const ids = [chromeAccount, terminalAccount, screenAccount].map((account) => account.uid);

  expect(new Set(ids).size).toBe(3);
});
