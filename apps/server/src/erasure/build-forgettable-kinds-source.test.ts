import { expect, test } from 'bun:test';
import { buildForgettableKindsSource } from './build-forgettable-kinds-source';

test('it lists the forgettable kinds of every descriptor in sorted order', () => {
  const source = buildForgettableKindsSource([
    {
      kind: 'record',
      recordKinds: {
        erasable: [],
        forgettable: ['tool_called', 'owner_message'],
        unforgettable: [],
      },
      legacyEnds: [],
    },
    {
      kind: 'image',
      recordKinds: { erasable: ['image.x'], forgettable: ['image.named'], unforgettable: ['y'] },
      legacyEnds: [],
    },
  ]);

  expect(source).toEndWith(
    "export const forgettableKinds = [\n  'image.named',\n  'owner_message',\n  'tool_called',\n] as const;\n",
  );
});
