import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { deviceStore } from '../mocks/device-store';
import { missingImage } from '../mocks/mock-device-procedures';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { LayoutView } from './layout-view';

test('it places each region in its columns and rows', () => {
  const rendered = render(
    <LayoutView
      layout={{
        columns: ['1fr', '2fr'],
        rows: ['1fr', '3fr'],
        regions: [
          {
            name: 'pond',
            column: 1,
            row: 1,
            columnSpan: 1,
            rowSpan: 2,
            background: null,
            content: { kind: 'markdown', markdown: 'ripples' },
            shown: null,
            until: null,
          },
          {
            name: 'note',
            column: 2,
            row: 2,
            columnSpan: 1,
            rowSpan: 1,
            background: null,
            content: { kind: 'markdown', markdown: 'Bins go out tonight' },
            shown: null,
            until: null,
          },
        ],
      }}
    />,
  );

  const layout = rendered.getByTestId('layout');
  const pond = layout.querySelector('[data-region="pond"]');
  const note = layout.querySelector('[data-region="note"]');

  expect([
    layout.style.gridTemplateColumns,
    layout.style.gridTemplateRows,
    pond?.getAttribute('style'),
    note?.getAttribute('style'),
  ]).toStrictEqual([
    'minmax(0, 1fr) minmax(0, 2fr)',
    'minmax(0, 1fr) minmax(0, 3fr)',
    'grid-column: 1 / span 1; grid-row: 1 / span 2;',
    'grid-column: 2 / span 1; grid-row: 2 / span 1;',
  ]);
});

test('it renders markdown in a region like a reply', () => {
  const rendered = render(
    <LayoutView
      layout={{
        columns: ['1fr'],
        rows: ['1fr'],
        regions: [
          {
            name: 'note',
            column: 1,
            row: 1,
            columnSpan: 1,
            rowSpan: 1,
            background: null,
            content: { kind: 'markdown', markdown: '# Bins go out tonight' },
            shown: null,
            until: null,
          },
        ],
      }}
    />,
  );

  expect(rendered.getByRole('heading', { name: 'Bins go out tonight' })).toBeVisible();
});

test('it draws nothing in a blank region', () => {
  const rendered = render(
    <LayoutView
      layout={{
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
            content: null,
            shown: null,
            until: null,
          },
        ],
      }}
    />,
  );

  expect(
    rendered.getByTestId('layout').querySelector('[data-region="pond"]'),
  ).toBeEmptyDOMElement();
});

test.each(['whole', 'fill'] as const)(
  'it fits the image of a region with the fit %s',
  async (fit) => {
    await createDeviceSession();

    const rendered = render(
      <LayoutView
        layout={{
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
              content: { kind: 'image', image: 'k3x9m2p7qa', fit },
              shown: null,
              until: null,
            },
          ],
        }}
      />,
    );

    const picture = await rendered.findByRole('img');

    expect(picture).toHaveAttribute('data-fit', fit);
  },
);

test('it leaves the image of one region in place when another region updates', async () => {
  await createDeviceSession();

  const rendered = render(
    <LayoutView
      layout={{
        columns: ['1fr', '1fr'],
        rows: ['1fr'],
        regions: [
          {
            name: 'pond',
            column: 1,
            row: 1,
            columnSpan: 1,
            rowSpan: 1,
            background: null,
            content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'whole' },
            shown: null,
            until: null,
          },
          {
            name: 'note',
            column: 2,
            row: 1,
            columnSpan: 1,
            rowSpan: 1,
            background: null,
            content: { kind: 'markdown', markdown: 'first' },
            shown: null,
            until: null,
          },
        ],
      }}
    />,
  );

  const before = await rendered.findByRole('img');

  rendered.rerender(
    <LayoutView
      layout={{
        columns: ['1fr', '1fr'],
        rows: ['1fr'],
        regions: [
          {
            name: 'pond',
            column: 1,
            row: 1,
            columnSpan: 1,
            rowSpan: 1,
            background: null,
            content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'whole' },
            shown: null,
            until: null,
          },
          {
            name: 'note',
            column: 2,
            row: 1,
            columnSpan: 1,
            rowSpan: 1,
            background: null,
            content: { kind: 'markdown', markdown: 'second' },
            shown: null,
            until: null,
          },
        ],
      }}
    />,
  );

  expect(rendered.getByRole('img')).toBe(before);
  expect(rendered.getByText('second')).toBeVisible();
});

test('it reports to the server the error of an image that a region cannot read', async () => {
  await createDeviceSession();

  render(
    <LayoutView
      layout={{
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
            content: { kind: 'image', image: missingImage, fit: 'whole' },
            shown: 'sh3k7m2q9x',
            until: null,
          },
        ],
      }}
    />,
  );

  await waitFor(() => {
    expect(
      deviceStore.pageErrors.findMany().map((error) => [error.region, error.shown]),
    ).toStrictEqual([['pond', 'sh3k7m2q9x']]);
  });
});

test('it reports again for a replacement image that fails with the same reason', async () => {
  await createDeviceSession();

  const first = {
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
        content: { kind: 'image' as const, image: missingImage, fit: 'whole' as const },
        shown: 'sh3k7m2q9x',
        until: null,
      },
    ],
  };

  const replaced = {
    ...first,
    regions: first.regions.map((region) => ({
      ...region,
      content: { kind: 'image' as const, image: `${missingImage}-2`, fit: 'whole' as const },
      shown: 'sh8d4n6w1z',
    })),
  };

  const rendered = render(<LayoutView layout={first} />);

  await waitFor(() => {
    expect(deviceStore.pageErrors.findMany()).toHaveLength(1);
  });

  rendered.rerender(<LayoutView layout={replaced} />);

  await waitFor(() => {
    expect(deviceStore.pageErrors.findMany().map((error) => error.shown)).toStrictEqual([
      'sh3k7m2q9x',
      'sh8d4n6w1z',
    ]);
  });
});

test('it frames a page in a sandbox that grants scripts and nothing else', () => {
  const rendered = render(
    <LayoutView
      layout={{
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
            content: { kind: 'html', frame: 'f3a1c2d4-0000-4000-8000-000000000001', images: [] },
            shown: 'sh3k7m2q9x',
            until: null,
          },
        ],
      }}
    />,
  );

  const frame = rendered.getByTestId('page-pond');

  expect([
    frame.tagName,
    frame.getAttribute('sandbox'),
    frame.getAttribute('src'),
    frame.getAttribute('referrerpolicy'),
  ]).toStrictEqual([
    'IFRAME',
    'allow-scripts',
    '/rpc/device/frames/f3a1c2d4-0000-4000-8000-000000000001',
    'no-referrer',
  ]);
});

test('it draws no frame for a page region whose content ID is missing', () => {
  const rendered = render(
    <LayoutView
      layout={{
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
            content: { kind: 'html', frame: 'f3a1c2d4-0000-4000-8000-000000000001', images: [] },
            shown: null,
            until: null,
          },
        ],
      }}
    />,
  );

  expect(rendered.queryByTestId('page-pond')).toBeNull();
});

test('it loads a page that replaces another page in a new frame', () => {
  const rendered = render(
    <LayoutView
      layout={{
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
            content: { kind: 'html', frame: 'f1', images: [] },
            shown: 'sh1',
            until: null,
          },
        ],
      }}
    />,
  );

  const first = rendered.getByTestId('page-pond');

  rendered.rerender(
    <LayoutView
      layout={{
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
            content: { kind: 'html', frame: 'f2', images: [] },
            shown: 'sh2',
            until: null,
          },
        ],
      }}
    />,
  );

  expect(rendered.getByTestId('page-pond')).not.toBe(first);
});

test('it keeps the frame of a page while the page stays', () => {
  const rendered = render(
    <LayoutView
      layout={{
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
            content: { kind: 'html', frame: 'f1', images: [] },
            shown: 'sh1',
            until: null,
          },
        ],
      }}
    />,
  );

  const first = rendered.getByTestId('page-pond');

  rendered.rerender(
    <LayoutView
      layout={{
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
            content: { kind: 'html', frame: 'f1', images: [] },
            shown: 'sh1',
            until: null,
          },
        ],
      }}
    />,
  );

  expect(rendered.getByTestId('page-pond')).toBe(first);
});
