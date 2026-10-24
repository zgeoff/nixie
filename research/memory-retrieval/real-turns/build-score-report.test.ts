import { expect, test } from 'bun:test';
import { buildScoreReport } from './build-score-report.ts';
import { SHIPPED } from './rank-turn.ts';

test('it prints a row a run in each table, compared with the shipped run of its kind', () => {
  const scored = buildScoreReport(
    [
      { name: 'leaf-ir-q8 hybrid', encoder: 'leaf-ir-q8', kind: 'ranking', config: SHIPPED, isShipped: true },
      { name: 'leaf-ir-q8 served', encoder: 'leaf-ir-q8', kind: 'served', config: SHIPPED, isShipped: true },
    ],
    new Map([
      ['leaf-ir-q8 hybrid', [{ caseID: 't1', ranking: { facts: ['noise-a', 'needed-a'], selves: [] } }]],
      ['leaf-ir-q8 served', [{ caseID: 't1', ranking: { facts: ['needed-a'], selves: [] } }]],
    ]),
    new Map([
      [
        't1',
        { relevant: new Set(['needed-a']), best: 'needed-a', noise: new Set<string>(), delivered: new Set<string>(), isLabelled: true },
      ],
    ]),
  );

  expect(scored.lines).toMatchInlineSnapshot(`
    [
      "| Run | Cases | Recall@3 | Recall@5 | Recall@10 | MRR | Best@5 | Recall@5 vs shipped | MRR vs shipped |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| leaf-ir-q8 hybrid | 1 | 1 | 1 | 1 | 0.5 | 1 | 0 (0 to 0) | 0 (0 to 0) |",
      "",
      "| Run | Gold cases | Covered recall | Fresh cases | Fresh recall | Empty cases | Shown on empty | Empty with any | Precision | Noise served | Shown per turn | Fresh change | Shown on empty change |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| leaf-ir-q8 served | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 1 | 0 (0 to 0) | 0 (0 to 0) |",
    ]
  `);
});
