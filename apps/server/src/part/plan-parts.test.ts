import { expect, test } from 'bun:test';
import { planParts } from './plan-parts';
import type { PartPlan } from './plan-parts';
import { startPartGraph } from './start-part-graph';

interface Values {
  core: string;
  extra: string;
  feat: string;
}

test('it leaves out a part whose feature is off', () => {
  const plan = planParts<Values>(
    ['voice'],
    [
      { name: 'core', needs: [], start: () => Promise.resolve('core') },
      { name: 'feat', feature: 'google', needs: [], start: () => Promise.resolve('feat') },
    ],
  );

  expect(plan.parts.map((part) => part.name)).toStrictEqual(['core']);
  expect([...plan.leftOut]).toStrictEqual(['feat']);
});

test('it keeps a part whose feature is on', () => {
  const plan: PartPlan<Values> = planParts<Values>(
    ['google'],
    [
      { name: 'core', needs: [], start: () => Promise.resolve('core') },
      { name: 'feat', feature: 'google', needs: [], start: () => Promise.resolve('feat') },
    ],
  );

  expect(plan.parts.map((part) => part.name)).toStrictEqual(['core', 'feat']);
});

test('it fails naming both features when a part requires a feature that is off', () => {
  expect(() =>
    planParts<Values>(
      ['google'],
      [
        {
          name: 'feat',
          feature: 'google',
          requires: ['mcp'],
          needs: [],
          start: () => Promise.resolve('feat'),
        },
      ],
    ),
  ).toThrowWithMessage(Error, /google feature requires the mcp feature, which is off/u);
});

test('it fails when a core part lists a feature part in needs', () => {
  expect(() =>
    planParts<Values>(
      ['google'],
      [
        { name: 'feat', feature: 'google', needs: [], start: () => Promise.resolve('feat') },
        { name: 'core', needs: ['feat'], start: () => Promise.resolve('core') },
      ],
    ),
  ).toThrowWithMessage(Error, /core part core lists part feat of the google feature in needs/u);
});

test('it finds null for a part that a feature left out, and starts the rest', async () => {
  const graph = startPartGraph<Values>(
    [
      { name: 'feat', feature: 'google', needs: [], start: () => Promise.resolve('feat') },
      {
        name: 'core',
        needs: [],
        uses: ['feat'],
        start: (parts) => Promise.resolve(`core sees ${String(parts.find('feat'))}`),
      },
    ],
    { features: [] },
  );

  const core = await graph.waitFor('core');

  expect(core).toBe('core sees null');
});
