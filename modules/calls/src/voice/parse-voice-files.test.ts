import { expect, test } from 'bun:test';
import { parseVoiceFiles } from './parse-voice-files';
import { defaultVoiceDefinitions } from './voice-definitions-schema';

test('#parseVoiceFiles holds no voice settings for a snapshot with no voice file', () => {
  expect(parseVoiceFiles(new Map())).toStrictEqual({
    voice: null,
    problems: [],
    paths: new Set(),
  });
});

test('#parseVoiceFiles converts the price per minute to micros and keeps the default lines', () => {
  const parsed = parseVoiceFiles(
    new Map([['voice/voice.yaml', 'voice: cedar\nhold_after_ms: 2000\nprice_per_minute: 0.05\n']]),
  );

  expect(parsed.voice).toStrictEqual({
    voice: 'cedar',
    holdAfterMs: 2000,
    pricePerMinuteMicros: 50_000,
    lines: defaultVoiceDefinitions.lines,
  });
});

test('#parseVoiceFiles reads the fixed lines from lines.yaml', () => {
  const parsed = parseVoiceFiles(
    new Map([
      [
        'voice/lines.yaml',
        'holding: Hang on.\nreconnect: Back.\ncouldnt_finish: Sorry.\nbudget: Out of money.\n',
      ],
    ]),
  );

  expect(parsed.voice?.lines).toStrictEqual({
    holding: 'Hang on.',
    reconnect: 'Back.',
    couldntFinish: 'Sorry.',
    budget: 'Out of money.',
  });
});

test('#parseVoiceFiles leaves the price unset when voice.yaml sets none', () => {
  const parsed = parseVoiceFiles(new Map([['voice/voice.yaml', 'voice: cedar\n']]));

  expect(parsed.voice?.pricePerMinuteMicros).toBeNull();
});

test.each([
  { name: 'text that is not YAML', text: 'voice: [unclosed' },
  { name: 'a negative price', text: 'price_per_minute: -1\n' },
  { name: 'a price that is text', text: 'price_per_minute: cheap\n' },
  { name: 'an unknown key', text: 'price_per_minut: 0.05\n' },
])('#parseVoiceFiles reports $name in voice.yaml and applies none of it', (row) => {
  const parsed = parseVoiceFiles(new Map([['voice/voice.yaml', row.text]]));

  expect(parsed).toStrictEqual({
    voice: null,
    problems: [{ path: 'voice/voice.yaml', reason: expect.any(String) }],
    paths: new Set(),
  });
});

test('#parseVoiceFiles keeps a good lines file when voice.yaml is bad', () => {
  const parsed = parseVoiceFiles(
    new Map([
      ['voice/voice.yaml', 'price_per_minute: -1\n'],
      ['voice/lines.yaml', 'holding: Hang on.\n'],
    ]),
  );

  expect([
    parsed.voice?.lines.holding,
    parsed.voice?.pricePerMinuteMicros,
    parsed.problems.length,
  ]).toStrictEqual(['Hang on.', null, 1]);
});

test.each(['1e20', '1e308', '1001'])(
  '#parseVoiceFiles refuses a price of %s dollars a minute, which no budget can add up',
  (price) => {
    const parsed = parseVoiceFiles(new Map([['voice/voice.yaml', `price_per_minute: ${price}\n`]]));

    expect({
      voice: parsed.voice,
      paths: parsed.problems.map((problem) => problem.path),
    }).toStrictEqual({
      voice: null,
      paths: ['voice/voice.yaml'],
    });
  },
);
