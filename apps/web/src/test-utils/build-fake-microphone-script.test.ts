import { expect, test } from 'bun:test';
import { buildFakeMicrophoneScript } from './build-fake-microphone-script';

test.each(['allow', 'block'] as const)(
  '#buildFakeMicrophoneScript writes a valid script for %s',
  (answer) => {
    const script = buildFakeMicrophoneScript({ answer });

    expect(() => new Bun.Transpiler({ loader: 'js' }).transformSync(script)).not.toThrow();
  },
);

test('#buildFakeMicrophoneScript makes the block answer refuse as a user block does', () => {
  const script = buildFakeMicrophoneScript({ answer: 'block' });

  expect(script).toContain('"block" === \'block\'');
});
