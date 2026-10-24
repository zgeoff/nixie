import { expect, test } from 'bun:test';
import { planHeardReply } from './plan-heard-reply.ts';

test('it plays the chunks back to back when nothing stops them', () => {
  expect(
    planHeardReply({
      received: [
        { at: 100, samples: new Float32Array([0.1, 0.2]) },
        { at: 101, samples: new Float32Array([0.3, 0.4]) },
      ],
      sampleRate: 1000,
      stopAt: undefined,
    }),
  ).toStrictEqual([
    { samples: new Float32Array([0.1, 0.2]), startAt: 100 },
    { samples: new Float32Array([0.3, 0.4]), startAt: 102 },
  ]);
});

test('it drops the audio that has not played by the stop and plays later audio as a new reply', () => {
  expect(
    planHeardReply({
      received: [
        { at: 100, samples: new Float32Array([0.1, 0.2, 0.3]) },
        { at: 100, samples: new Float32Array([0.4, 0.5]) },
        { at: 120, samples: new Float32Array([0.6]) },
      ],
      sampleRate: 1000,
      stopAt: 104,
    }),
  ).toStrictEqual([
    { samples: new Float32Array([0.1, 0.2, 0.3]), startAt: 100 },
    { samples: new Float32Array([0.4]), startAt: 103 },
    { samples: new Float32Array([0.6]), startAt: 120 },
  ]);
});
