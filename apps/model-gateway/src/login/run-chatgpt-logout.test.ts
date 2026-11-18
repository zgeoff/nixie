import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLoginFile } from '../test-utils/build-login-file';
import { readLoginFile } from './read-login-file';
import { runChatGPTLogout } from './run-chatgpt-logout';
import { writeLoginFile } from './write-login-file';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-chatgpt-logout-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { loginPath: join(directory, 'plan.json') };
}

test('it removes the login file and tells the operator to sign the device out', async () => {
  const ctx = await setupTest();

  const output: string[] = [];

  await writeLoginFile(ctx.loginPath, buildLoginFile());

  await runChatGPTLogout({
    routeID: 'codex-plan',
    loginPath: ctx.loginPath,
    write: (text) => {
      output.push(text);
    },
  });

  const result = await readLoginFile(ctx.loginPath);

  expect(result).toBeNull();

  expect(output.join('')).toBe(
    "Removed the login for codex-plan. Sign this device out in ChatGPT's security settings.\n",
  );
});

test('it removes no file and does not fail when the route has no login file', async () => {
  const ctx = await setupTest();

  await runChatGPTLogout({ routeID: 'codex-plan', loginPath: ctx.loginPath, write: () => {} });

  const result = await readLoginFile(ctx.loginPath);

  expect(result).toBeNull();
});
