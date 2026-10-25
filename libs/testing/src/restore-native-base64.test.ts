import { expect, test } from 'bun:test';
import { atob, btoa } from 'node:buffer';

test("it puts Bun's own atob and btoa back in place of happy-dom's", () => {
  expect([globalThis.atob, globalThis.btoa]).toStrictEqual([atob, btoa]);
});
