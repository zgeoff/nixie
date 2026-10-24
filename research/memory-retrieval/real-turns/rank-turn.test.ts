import { expect, onTestFinished, test } from 'bun:test';
// @boundaries-ignore a spike imports the code it measures
import { startMemoryIndex } from '../../../modules/memory/src/start-memory-index.ts';
import { buildRanker } from './rank-turn.ts';
import { buildRuns } from './score-turns.ts';

async function setupTest() {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  const ranker = buildRanker({ encode: async (texts) => texts.map(() => new Float32Array([1, 0])) }, index);

  return { ranker };
}

test('it ranks every item of the store in a ranking run', async () => {
  const ctx = await setupTest();
  const hybrid = buildRuns(['leaf-ir-q8']).find((run) => run.name === 'leaf-ir-q8 hybrid');

  if (hybrid === undefined) {
    throw new Error('the shipped ranking run is missing');
  }

  const ranking = await ctx.ranker.rankTurn(
    {
      caseID: 't1',
      stepSequence: 1,
      recalledSequence: 2,
      recordedAt: 0,
      query: 'garden tomatoes',
      reply: '',
      earlier: [],
      candidates: Array.from({ length: 12 }, (_, position) => ({
        itemID: `item-${position + 1}`,
        version: 1,
        isSelf: false,
        isPinned: false,
        isLapsed: false,
        text: `The garden bed ${position + 1} grows tomatoes`,
      })),
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    hybrid.config,
    [],
  );

  expect(ranking.facts).toHaveLength(12);
});
