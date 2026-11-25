import { expect, test } from 'bun:test';
import { readPreviewPage } from '../test-utils';
import { buildPreviewPage } from './build-preview-page';

test('it places each region in its columns and rows on a grid of minmax tracks', () => {
  const page = readPreviewPage(
    buildPreviewPage({
      surface: {
        kind: 'layout',
        layout: {
          layoutID: 'ly3k7m2q9x',
          columns: ['1fr', '2fr'],
          rows: ['1fr'],
          regions: [
            {
              name: 'pond',
              column: 2,
              row: 1,
              columnSpan: 1,
              rowSpan: 1,
              background: null,
              shown: null,
            },
          ],
        },
      },
      images: new Map(),
      nowMs: Date.parse('2026-11-21T08:05:09.000Z'),
      timeZone: 'UTC',
    }),
  );

  expect([
    page.includes('grid-template-columns:minmax(0, 1fr) minmax(0, 2fr)'),
    page.includes('data-region="pond" style="grid-column:2 / span 1;grid-row:1 / span 1;"'),
  ]).toStrictEqual([true, true]);
});

test('it gives a region on a pale background black text', () => {
  const page = readPreviewPage(
    buildPreviewPage({
      surface: {
        kind: 'layout',
        layout: {
          layoutID: 'ly3k7m2q9x',
          columns: ['1fr'],
          rows: ['1fr'],
          regions: [
            {
              name: 'pond',
              column: 1,
              row: 1,
              columnSpan: 1,
              rowSpan: 1,
              background: 'yellow',
              shown: null,
            },
          ],
        },
      },
      images: new Map(),
      nowMs: Date.parse('2026-11-21T08:05:09.000Z'),
      timeZone: 'UTC',
    }),
  );

  expect(page).toContain('background-color:yellow;color:black;');
});

test('it keeps raw HTML in markdown as text and a link as underlined words with no address', () => {
  const page = readPreviewPage(
    buildPreviewPage({
      surface: {
        kind: 'blocks',
        blocks: [
          { kind: 'markdown', text: '<img src=x onerror=alert(1)> [docs](https://example.com)' },
        ],
      },
      images: new Map(),
      nowMs: Date.parse('2026-11-21T08:05:09.000Z'),
      timeZone: 'UTC',
    }),
  );

  expect([
    page.includes('&lt;img src=x onerror=alert(1)&gt;'),
    page.includes('href='),
    page.includes('<a>docs</a>'),
  ]).toStrictEqual([true, false, true]);
});

test.each([
  {
    title: 'an image as a labelled link',
    markdown: '![weather chart](https://example.com/c.png)',
    expected: '<a>image: weather chart</a>',
  },
  {
    title: 'an image with no alt text as untitled',
    markdown: '![](https://example.com/c.png)',
    expected: '<a>image: untitled</a>',
  },
  {
    title: 'an image inside a link as its label alone',
    markdown: '[![weather chart](https://example.com/c.png)](https://example.com)',
    expected: '<a>image: weather chart</a>',
  },
])('it shows $title', (row) => {
  const page = readPreviewPage(
    buildPreviewPage({
      surface: { kind: 'blocks', blocks: [{ kind: 'markdown', text: row.markdown }] },
      images: new Map(),
      nowMs: Date.parse('2026-11-21T08:05:09.000Z'),
      timeZone: 'UTC',
    }),
  );

  expect([
    page.includes(row.expected),
    page.includes('<img'),
    page.includes('<a><a>'),
  ]).toStrictEqual([true, false, false]);
});

test.each([
  {
    title: 'a clock in the time zone it is given',
    content: { kind: 'live', live: 'clock', format: 'HH:mm:ss' } as const,
    text: '19:05:09',
  },
  {
    title: 'a countdown to a time',
    content: {
      kind: 'live',
      live: 'countdown',
      to: '2026-11-21T09:30:09.000Z',
      label: 'Bus',
    } as const,
    text: '1:25:00',
  },
])('it draws $title', (row) => {
  const page = readPreviewPage(
    buildPreviewPage({
      surface: {
        kind: 'layout',
        layout: {
          layoutID: 'ly3k7m2q9x',
          columns: ['1fr'],
          rows: ['1fr'],
          regions: [
            {
              name: 'pond',
              column: 1,
              row: 1,
              columnSpan: 1,
              rowSpan: 1,
              background: null,
              shown: { shownID: 'sh3k7m2q9x', sequence: 4, content: row.content, untilMs: null },
            },
          ],
        },
      },
      images: new Map(),
      nowMs: Date.parse('2026-11-21T08:05:09.000Z'),
      timeZone: 'Australia/Sydney',
    }),
  );

  expect(page).toContain(row.text);
});

test('it sends the files of the images that the page shows beside the page', () => {
  const files = buildPreviewPage({
    surface: { kind: 'blocks', blocks: [{ kind: 'image', image: 'k3x9m2p7qa', fit: 'fill' }] },
    images: new Map([['k3x9m2p7qa', { path: 'images/0', mediaType: 'image/png', base64: 'AQID' }]]),
    nowMs: Date.parse('2026-11-21T08:05:09.000Z'),
    timeZone: 'UTC',
  });

  expect({
    paths: files.map((file) => file.path),
    draws: readPreviewPage(files).includes('<img class="fill" alt="" src="images/0">'),
  }).toStrictEqual({ paths: ['index.html', 'images/0'], draws: true });
});

test('it draws nothing for an image that has no file', () => {
  const page = readPreviewPage(
    buildPreviewPage({
      surface: { kind: 'blocks', blocks: [{ kind: 'image', image: 'k3x9m2p7qa', fit: 'whole' }] },
      images: new Map(),
      nowMs: Date.parse('2026-11-21T08:05:09.000Z'),
      timeZone: 'UTC',
    }),
  );

  expect(page.includes('<img')).toBeFalse();
});
