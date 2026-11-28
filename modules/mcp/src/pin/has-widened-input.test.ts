import { expect, test } from 'bun:test';
import { hasWidenedInput } from './has-widened-input';

function setupTest() {
  return {
    base: {
      type: 'object',
      properties: { id: { type: 'string', maxLength: 20 }, state: { enum: ['open', 'closed'] } },
      required: ['id'],
    },
  };
}

test('it finds an identical schema no wider', () => {
  const ctx = setupTest();

  expect(hasWidenedInput(ctx.base, structuredClone(ctx.base))).toBe(false);
});

test('it finds a schema no wider when only descriptions and titles change', () => {
  const ctx = setupTest();

  const after = {
    type: 'object',
    description: 'Read one item',
    properties: {
      id: { type: 'string', maxLength: 20, description: 'The item ID', title: 'Item' },
      state: { enum: ['open', 'closed'], examples: ['open'] },
    },
    required: ['id'],
  };

  expect(hasWidenedInput(ctx.base, after)).toBe(false);
});

test.each([
  {
    title: 'a new property at the top',
    after: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 20 },
        state: { enum: ['open', 'closed'] },
        owner: {},
      },
      required: ['id'],
    },
  },
  {
    title: 'a removed constraint',
    after: {
      type: 'object',
      properties: { id: { type: 'string' }, state: { enum: ['open', 'closed'] } },
      required: ['id'],
    },
  },
  {
    title: 'a raised maximum',
    after: {
      type: 'object',
      properties: { id: { type: 'string', maxLength: 200 }, state: { enum: ['open', 'closed'] } },
      required: ['id'],
    },
  },
  {
    title: 'a longer enum',
    after: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 20 },
        state: { enum: ['open', 'closed', 'any'] },
      },
      required: ['id'],
    },
  },
  {
    title: 'a wider type',
    after: {
      type: 'object',
      properties: {
        id: { type: ['string', 'null'], maxLength: 20 },
        state: { enum: ['open', 'closed'] },
      },
      required: ['id'],
    },
  },
  {
    title: 'a property that stops being required',
    after: {
      type: 'object',
      properties: { id: { type: 'string', maxLength: 20 }, state: { enum: ['open', 'closed'] } },
      required: [],
    },
  },
  {
    title: 'a property that is no longer listed in an open schema',
    after: {
      type: 'object',
      properties: { id: { type: 'string', maxLength: 20 } },
      required: ['id'],
    },
  },
  {
    title: 'a new property named like an annotation',
    after: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 20 },
        state: { enum: ['open', 'closed'] },
        description: { type: 'string' },
      },
      required: ['id'],
    },
  },
])('it finds a schema wider with $title', (row) => {
  const ctx = setupTest();

  expect(hasWidenedInput(ctx.base, row.after)).toBe(true);
});

test('it finds a schema wider when it stops refusing other properties', () => {
  const ctx = setupTest();
  const before = { ...ctx.base, additionalProperties: false };

  expect(hasWidenedInput(before, { ...ctx.base, additionalProperties: true })).toBe(true);
});

test.each([
  {
    title: 'a new constraint',
    after: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 20, minLength: 1 },
        state: { enum: ['open', 'closed'] },
      },
      required: ['id'],
    },
  },
  {
    title: 'a lowered maximum',
    after: {
      type: 'object',
      properties: { id: { type: 'string', maxLength: 10 }, state: { enum: ['open', 'closed'] } },
      required: ['id'],
    },
  },
  {
    title: 'a shorter enum',
    after: {
      type: 'object',
      properties: { id: { type: 'string', maxLength: 20 }, state: { enum: ['open'] } },
      required: ['id'],
    },
  },
  {
    title: 'a newly required property',
    after: {
      type: 'object',
      properties: { id: { type: 'string', maxLength: 20 }, state: { enum: ['open', 'closed'] } },
      required: ['id', 'state'],
    },
  },
])('it finds a schema no wider with $title', (row) => {
  const ctx = setupTest();

  expect(hasWidenedInput(ctx.base, row.after)).toBe(false);
});

test('it finds a dropped property no wider when the schema refuses other properties', () => {
  const ctx = setupTest();
  const before = { ...ctx.base, additionalProperties: false };
  const after = { ...before, properties: { id: ctx.base.properties.id }, required: ['id'] };

  expect(hasWidenedInput(before, after)).toBe(false);
});
