import { expect, test } from 'bun:test';
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
            until: null,
          },
        ],
      }}
    />,
  );

  expect(rendered.getByRole('img')).toBe(before);
  expect(rendered.getByText('second')).toBeVisible();
});
