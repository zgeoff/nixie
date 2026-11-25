import { expect, test } from 'bun:test';
import { buildPageFrame } from './build-page-frame';

function setupTest() {
  return {
    build: (html: string, overrides: { images?: ReadonlyMap<string, string> } = {}) =>
      buildPageFrame({
        html,
        images: overrides.images ?? new Map(),
        imageBase: 'https://nixie.test/rpc/device/images/',
        initialMessages: [],
        isPolicyInline: false,
      }),
  };
}

test('#buildPageFrame gives the page no network and no outside files', () => {
  const ctx = setupTest();

  expect(ctx.build('<p>ripples</p>').policy.split('; ')).toStrictEqual([
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'font-src data:',
    'img-src https://nixie.test/rpc/device/images/ data:',
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "require-trusted-types-for 'script'",
    'trusted-types default',
    'sandbox allow-scripts',
  ]);
});

test('#buildPageFrame puts the page in the body after the bridge', () => {
  const ctx = setupTest();
  const document = ctx.build('<canvas id="pond"></canvas>').document;

  expect(document.indexOf("window, 'nixie'")).toBeLessThan(document.indexOf('<canvas id="pond">'));
});

test('#buildPageFrame names each declared image by the ID the page uses', () => {
  const ctx = setupTest();

  const frame = ctx.build('<p></p>', {
    images: new Map([['k3x9m2p7qa', 'https://nixie.test/rpc/device/images/t1']]),
  });

  expect(frame.document).toContain('"k3x9m2p7qa":"https://nixie.test/rpc/device/images/t1"');
});

test('#buildPageFrame keeps a closing script tag in an image ID out of the bridge', () => {
  const ctx = setupTest();

  const frame = ctx.build('<p></p>', {
    images: new Map([['</script><b>', 'https://nixie.test/rpc/device/images/t1']]),
  });

  expect(frame.document.split('</script>')).toHaveLength(2);
});

test('#buildPageFrame puts the policy in a meta tag, with no sandbox directive, for a frame that a file serves', () => {
  const frame = buildPageFrame({
    html: '<p></p>',
    images: new Map(),
    imageBase: 'http://nixie-render.invalid/images/',
    initialMessages: [],
    isPolicyInline: true,
  });

  expect(frame.document).toContain(
    `<meta http-equiv="Content-Security-Policy" content="${frame.policy.replace('; sandbox allow-scripts', '')}">`,
  );
});

test('#buildPageFrame hands the page its retained message as its first message', () => {
  const frame = buildPageFrame({
    html: '<p></p>',
    images: new Map(),
    imageBase: 'http://nixie-render.invalid/images/',
    initialMessages: [{ ripples: 3 }],
    isPolicyInline: true,
  });

  expect(frame.document).toContain('var buffer = [{"ripples":3}];');
});
