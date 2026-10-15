import { expect, test } from 'bun:test';
import { renderSummaryCut } from './render-summary-cut';

test('it renders the cut request as a compaction message with the size, the cap and the word target', () => {
  const rendered = renderSummaryCut({
    at: 'Tue 14 Oct, 22:50, Sydney',
    tokens: 2600,
    summaryTokens: 2000,
  });

  expect(rendered.replaceAll(/[\da-f]{12}/gu, 'BLOCKID')).toMatchInlineSnapshot(`
    "<system-message type="compaction" id="BLOCKID" at="Tue 14 Oct, 22:50, Sydney">
    The summary is about 2600 tokens, past the cap of 2000.
    Cut it to about 1400 words. Keep the open threads and the decisions first, and keep the same rules.
    Answer with the cut summary alone.
    </system-message id="BLOCKID">"
  `);
});
