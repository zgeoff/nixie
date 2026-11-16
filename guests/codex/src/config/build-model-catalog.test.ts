import { expect, test } from 'bun:test';
import { buildModelCatalog } from './build-model-catalog';

test('it holds one entry for the model with every tool switch off', () => {
  expect(buildModelCatalog('house-model-1')).toStrictEqual({
    models: [
      expect.objectContaining({
        slug: 'house-model-1',
        tool_mode: null,
        experimental_supported_tools: [],
        apply_patch_tool_type: null,
        supports_search_tool: false,
      }),
    ],
  });
});

test('it lists every reasoning effort that nixie takes', () => {
  const [entry] = buildModelCatalog('house-model-1').models;

  expect(entry).toStrictEqual(
    expect.objectContaining({
      supported_reasoning_levels: [
        { effort: 'low', description: 'low' },
        { effort: 'medium', description: 'medium' },
        { effort: 'high', description: 'high' },
        { effort: 'xhigh', description: 'xhigh' },
        { effort: 'max', description: 'max' },
      ],
    }),
  );
});
