import { expect, test } from 'bun:test';
import { regionContentSchema } from './region-content-schema';

test.each([
  '<link rel="preconnect" href="https://tides.example">',
  '<p>tides</p><LINK rel=prefetch href=//tides.example/a>',
  '<link\nrel="prerender" href="/a">',
  '<iframe srcdoc="&lt;link rel=preconnect href=//tides.example&gt;"></iframe>',
  '<OBJECT data="data:text/html,x"></OBJECT>',
  '<embed src="about:blank">',
])('it refuses a page that holds a link or frame element: %s', (html) => {
  expect(regionContentSchema.safeParse({ kind: 'html', html }).success).toBeFalse();
});

test.each([
  '<p>tides</p>',
  '<style>p { color: red }</style><a href="#x">linked</a>',
  '<p>an iframe-like word</p>',
])('it accepts a page with no link or frame element: %s', (html) => {
  expect(regionContentSchema.safeParse({ kind: 'html', html }).success).toBeTrue();
});

test('it keeps the packages and the fetches that a page names', () => {
  const content = {
    kind: 'html' as const,
    html: '<p>tides</p>',
    packages: ['chart.js@4.4.6', '@scope/pkg@1.0.0-rc.1'],
    fetches: [{ url: 'https://tides.example/today?id=3', refreshMinutes: 30 }],
  };

  expect(regionContentSchema.parse(content)).toStrictEqual(content);
});

test.each(['chart.js', 'chart.js@^4', 'chart.js@latest', 'Chart.JS@1.0.0', '@1.0.0', 'a@1.0'])(
  'it refuses the package %s, which is no name with an exact version',
  (name) => {
    const content = { kind: 'html', html: '<p>x</p>', packages: [name] };

    expect(regionContentSchema.safeParse(content).success).toBeFalse();
  },
);

test.each([
  ['an http URL', { url: 'http://tides.example/a' }],
  ['no URL', { url: 'tides' }],
  ['a refresh under 5 minutes', { url: 'https://tides.example/a', refreshMinutes: 4 }],
  ['a refresh over a day', { url: 'https://tides.example/a', refreshMinutes: 1441 }],
])('it refuses a fetch with %s', (_name, fetch) => {
  const content = { kind: 'html', html: '<p>x</p>', fetches: [fetch] };

  expect(regionContentSchema.safeParse(content).success).toBeFalse();
});

test('it refuses a page that declares more than 8 fetches', () => {
  const fetches = Array.from({ length: 9 }, (_, index) => ({
    url: `https://tides.example/${String(index)}`,
  }));

  expect(
    regionContentSchema.safeParse({ kind: 'html', html: '<p>x</p>', fetches }).success,
  ).toBeFalse();
});
