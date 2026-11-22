import { expect, test } from 'bun:test';
import { collectScreenImages } from './collect-screen-images';

test('#collectScreenImages names the image of a show and no markdown', () => {
  expect(
    collectScreenImages({
      kind: 'show',
      content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'whole' },
      until: null,
    }),
  ).toStrictEqual(['k3x9m2p7qa']);
});

test('#collectScreenImages names each image of an idle scene', () => {
  expect(
    collectScreenImages({
      kind: 'idle',
      scene: [
        { kind: 'markdown', text: '# Saturday' },
        { kind: 'image', image: 'k3x9m2p7qa', fit: 'fill' },
        { kind: 'image', image: 'p8w2n5c1rt', fit: 'whole' },
      ],
    }),
  ).toStrictEqual(['k3x9m2p7qa', 'p8w2n5c1rt']);
});
