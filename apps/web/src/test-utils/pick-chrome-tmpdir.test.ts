import { expect, test } from 'bun:test';
import { pickChromeTmpdir } from './pick-chrome-tmpdir';

test("it keeps Chrome's temp folder in TMPDIR when its socket path fits", () => {
  expect(pickChromeTmpdir('/var/tmp', '4417')).toBe('/var/tmp/nixie-browser-chrome/4417');
});

test("it keeps Chrome's temp folder in a TMPDIR whose socket path takes the last of the 107 bytes", () => {
  const tmpdir = `/${'d'.repeat(35)}`;

  expect(
    `${tmpdir}/nixie-browser-chrome/4417/org.chromium.Chromium.XXXXXX/SingletonSocket`,
  ).toHaveLength(107);

  expect(pickChromeTmpdir(tmpdir, '4417')).toBe(`${tmpdir}/nixie-browser-chrome/4417`);
});

test("it moves Chrome's temp folder to /tmp when the socket path in TMPDIR passes 107 bytes", () => {
  const tmpdir = `/${'d'.repeat(36)}`;

  expect(pickChromeTmpdir(tmpdir, '4417')).toBe('/tmp/nixie-browser-chrome/4417');
});
