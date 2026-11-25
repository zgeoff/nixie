import { expect, test } from 'bun:test';
import { regionContentSchema } from './region-content-schema';

test.each([
  '<link rel="preconnect" href="https://tides.example">',
  '<p>tides</p><LINK rel=prefetch href=//tides.example/a>',
  '<link\nrel="prerender" href="/a">',
])('it refuses a page that holds a link element: %s', (html) => {
  expect(regionContentSchema.safeParse({ kind: 'html', html }).success).toBeFalse();
});

test.each(['<p>tides</p>', '<style>p { color: red }</style><a href="#x">linked</a>'])(
  'it accepts a page with no link element: %s',
  (html) => {
    expect(regionContentSchema.safeParse({ kind: 'html', html }).success).toBeTrue();
  },
);
