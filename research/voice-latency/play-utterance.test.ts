import { expect, mock, test } from 'bun:test';
import type { DetectorName } from './find-turn-end.ts';
import { playUtterance } from './play-utterance.ts';
import { buildStepClock } from './test-utils/build-step-clock.ts';
import { buildStubVad } from './test-utils/build-stub-vad.ts';

test('it records each pause with its speech end, its resume and each answer time from the speech end', async () => {
  const askDetector = mock((_detector: DetectorName, _heard: Float32Array) => Promise.resolve({ probability: 0.9 }));

  const pauses = await playUtterance(new Float32Array(16_000), {
    askDetector,
    clock: buildStepClock(),
    detectors: ['smartTurn', 'jev'],
    readTranscript: () => Promise.resolve('book a table'),
    vad: buildStubVad([
      { closesAfterSamples: 11_200, end: 8000, start: 3200 },
      { closesAfterSamples: 17_600, end: 14_400, start: 9600 },
    ]),
  });

  expect(pauses).toStrictEqual([
    {
      answers: {
        jev: { answeredAfterMs: 204, probability: 0.9 },
        smartTurn: { answeredAfterMs: 204, probability: 0.9 },
      },
      resumeMs: 600,
      speechEndMs: 500,
      transcript: 'book a table',
    },
    {
      answers: {
        jev: { answeredAfterMs: 220, probability: 0.9 },
        smartTurn: { answeredAfterMs: 220, probability: 0.9 },
      },
      resumeMs: undefined,
      speechEndMs: 900,
      transcript: 'book a table',
    },
  ]);
});

test('it hands each detector the audio up to the end of the window that closed the segment', async () => {
  const askDetector = mock((_detector: DetectorName, _heard: Float32Array) => Promise.resolve({ probability: 0.9 }));

  await playUtterance(new Float32Array(16_000), {
    askDetector,
    clock: buildStepClock(),
    detectors: ['smartTurn', 'jev'],
    readTranscript: () => Promise.resolve('book a table'),
    vad: buildStubVad([{ closesAfterSamples: 11_200, end: 8000, start: 3200 }]),
  });

  expect(askDetector.mock.calls.map(([detector, heard]) => [detector, heard.length])).toStrictEqual([
    ['smartTurn', 11_264],
    ['jev', 11_264],
  ]);
});

test('it records a failed answer as its error', async () => {
  const pauses = await playUtterance(new Float32Array(16_000), {
    askDetector: () => Promise.reject(new Error('jev: HTTP 429')),
    clock: buildStepClock(),
    detectors: ['jev'],
    readTranscript: () => Promise.resolve('book a table'),
    vad: buildStubVad([{ closesAfterSamples: 11_200, end: 8000, start: 3200 }]),
  });

  expect(pauses).toStrictEqual([
    {
      answers: { jev: { error: 'Error: jev: HTTP 429' } },
      resumeMs: undefined,
      speechEndMs: 500,
      transcript: 'book a table',
    },
  ]);
});

test('it reads no transcript when only the audio detector runs', async () => {
  const readTranscript = mock(() => Promise.resolve('book a table'));

  await playUtterance(new Float32Array(16_000), {
    askDetector: () => Promise.resolve({ probability: 0.9 }),
    clock: buildStepClock(),
    detectors: ['smartTurn'],
    readTranscript,
    vad: buildStubVad([{ closesAfterSamples: 11_200, end: 8000, start: 3200 }]),
  });

  expect(readTranscript).not.toHaveBeenCalled();
});
