import { expect, test } from 'bun:test';
import { readDevicePackage } from '../package/read-device-packages';
import { startTestDevices } from './start-test-devices';

test('it stores a package with the paths of its files', async () => {
  const ctx = await startTestDevices();

  await ctx.seed.package('@scope/pkg@1.0.0', {
    'index.js': 'var a = 1;',
    'lib/b.js': 'var b = 2;',
  });

  const stored = await readDevicePackage(ctx.log.writer.db, '@scope/pkg', '1.0.0');

  expect(stored?.files).toStrictEqual(['index.js', 'lib/b.js']);
});
