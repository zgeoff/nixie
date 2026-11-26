import { expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { ApprovalPackage } from './approval-package';

function setupTest() {
  return {
    // server markup puts a marker between 2 adjacent text nodes, which the page never shows
    render: (unpackedBytes: number | null, description = 'Charts for pages') =>
      renderToString(
        <ApprovalPackage
          package={{
            name: 'chart.js',
            version: '4.4.6',
            unpackedBytes,
            publisher: 'a-publisher',
            description,
            integrity: `sha512-${'A'.repeat(86)}==`,
          }}
        />,
      ).replaceAll('<!-- -->', ''),
  };
}

test('it shows the package, its publisher, its size and its hash', () => {
  const ctx = setupTest();
  const markup = ctx.render(2048);

  expect(markup).toContain('chart.js 4.4.6');
  expect(markup).toContain('Published by a-publisher');
  expect(markup).toContain('Unpacks to 2.0 KiB');
  expect(markup).toContain(`sha512-${'A'.repeat(86)}==`);
});

test("it marks the description as the publisher's own words", () => {
  const ctx = setupTest();

  expect(ctx.render(2048)).toContain('The publisher&#x27;s words: <q>Charts for pages</q>');
});

test('it says so when the registry gives no size', () => {
  const ctx = setupTest();

  expect(ctx.render(null)).toContain('The registry gives no size');
});

test('it leaves out the words of a package with no description', () => {
  const ctx = setupTest();

  expect(ctx.render(2048, '')).not.toContain('words');
});
