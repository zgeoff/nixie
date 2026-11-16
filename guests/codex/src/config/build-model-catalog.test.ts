import { expect, test } from 'bun:test';
import { codexEfforts } from '@heynixie/wire';
import { codexVersion } from '../codex-version';
import { buildModelCatalog } from './build-model-catalog';
import bundled from './codex-0.166.0-bundled-efforts.json';

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

// The CLI's protocol types and JSON schema give an effort as an open string. Its only list is
// its bundled model catalog: the fixture is the output of `codex debug models --bundled` on the
// pinned CLI, named by its version, so a new pin writes a new fixture.
test('it takes the efforts that the pinned CLI bundles, less ultra', () => {
  expect(bundled.codexVersion).toBe(codexVersion);

  // nixie leaves out `ultra`, which its other harness does not take either.
  const efforts = new Set(bundled.models.flatMap((model) => model.efforts));

  efforts.delete('ultra');

  expect(new Set<string>(codexEfforts)).toStrictEqual(efforts);
});
