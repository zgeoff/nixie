import { expect, test } from 'bun:test';
import { skillsConfigSchema } from './skills-config-schema';

test('it gives the catalog 2% of the context window by default', () => {
  expect(skillsConfigSchema.parse({})).toStrictEqual({ catalogShare: 0.02 });
});

test('it reads a catalog share the deployment sets', () => {
  expect(skillsConfigSchema.parse({ catalog_share: 0.05 })).toStrictEqual({ catalogShare: 0.05 });
});

test('it refuses a catalog share of 0', () => {
  const result = skillsConfigSchema.safeParse({ catalog_share: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['catalog_share'] });
});

test('it refuses a catalog share past half the window', () => {
  const result = skillsConfigSchema.safeParse({ catalog_share: 0.6 });

  expect(result.error?.issues).toPartiallyContain({ path: ['catalog_share'] });
});

test('it refuses an unknown key', () => {
  const result = skillsConfigSchema.safeParse({ catalog_shares: 0.05 });

  expect(result.error?.issues).toPartiallyContain({ path: [] });
});
