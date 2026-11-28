import { expect, test } from 'bun:test';
import { buildToolForm } from '../test-utils/build-tool-form';
import { decideMissingPin, decidePin } from './decide-pin';

function setupTest() {
  return {
    widened: buildToolForm({
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' }, recipient: { type: 'string' } },
        required: ['id'],
      },
    }),
  };
}

test('it exposes a tool whose hash equals its pin', () => {
  const decision = decidePin({
    existing: { pinnedHash: 'sha256:a', latestHash: 'sha256:a', state: 'exposed' },
    pinnedForm: buildToolForm(),
    form: buildToolForm(),
    hash: 'sha256:a',
    nameRefusal: null,
  });

  expect(decision).toStrictEqual({
    state: 'exposed',
    pinnedHash: 'sha256:a',
    latestHash: 'sha256:a',
    move: null,
    propose: null,
    notice: null,
    hiddenReason: null,
  });
});

test('it moves the pin of a tool whose form changes and keeps its input shape, with a notice', () => {
  const decision = decidePin({
    existing: { pinnedHash: 'sha256:a', latestHash: 'sha256:a', state: 'exposed' },
    pinnedForm: buildToolForm(),
    form: buildToolForm({ description: 'Read one item and mail it.', annotations: null }),
    hash: 'sha256:b',
    nameRefusal: null,
  });

  expect(decision).toStrictEqual({
    state: 'exposed',
    pinnedHash: 'sha256:b',
    latestHash: 'sha256:b',
    move: { fromHash: 'sha256:a', toHash: 'sha256:b', cause: 'changed' },
    propose: null,
    notice: { kind: 'tool_changed', fromHash: 'sha256:a', toHash: 'sha256:b' },
    hiddenReason: null,
  });
});

test('it stops a tool whose form widens its input and proposes the accept', () => {
  const ctx = setupTest();

  const decision = decidePin({
    existing: { pinnedHash: 'sha256:a', latestHash: 'sha256:a', state: 'exposed' },
    pinnedForm: buildToolForm(),
    form: ctx.widened,
    hash: 'sha256:b',
    nameRefusal: null,
  });

  expect(decision).toStrictEqual({
    state: 'stopped_changed',
    pinnedHash: 'sha256:a',
    latestHash: 'sha256:b',
    move: null,
    propose: { fromHash: 'sha256:a', hash: 'sha256:b' },
    notice: null,
    hiddenReason: null,
  });
});

test('it pins a tool that no listing has held at its first listing, with no proposal', () => {
  const decision = decidePin({
    existing: null,
    pinnedForm: null,
    form: buildToolForm(),
    hash: 'sha256:a',
    nameRefusal: null,
  });

  expect(decision).toStrictEqual({
    state: 'exposed',
    pinnedHash: 'sha256:a',
    latestHash: 'sha256:a',
    move: { fromHash: null, toHash: 'sha256:a', cause: 'listed' },
    propose: null,
    notice: null,
    hiddenReason: null,
  });
});

test('it pins a tool that stayed hidden for an answer that never came, at its current form', () => {
  const decision = decidePin({
    existing: { pinnedHash: null, latestHash: 'sha256:a', state: 'hidden_new' },
    pinnedForm: null,
    form: buildToolForm(),
    hash: 'sha256:b',
    nameRefusal: null,
  });

  expect(decision).toStrictEqual({
    state: 'exposed',
    pinnedHash: 'sha256:b',
    latestHash: 'sha256:b',
    move: { fromHash: null, toHash: 'sha256:b', cause: 'listed' },
    propose: null,
    notice: null,
    hiddenReason: null,
  });
});

test('it keeps a tool hidden, with the reason, when its name is refused', () => {
  const decision = decidePin({
    existing: null,
    pinnedForm: null,
    form: buildToolForm(),
    hash: 'sha256:a',
    nameRefusal: 'its name is longer than the model allows',
  });

  expect(decision).toStrictEqual({
    state: 'hidden_new',
    pinnedHash: null,
    latestHash: 'sha256:a',
    move: null,
    propose: null,
    notice: null,
    hiddenReason: 'its name is longer than the model allows',
  });
});

test('it pins the latest form of a tool whose pinned form a forget erased', () => {
  const decision = decidePin({
    existing: { pinnedHash: 'sha256:a', latestHash: 'sha256:a', state: 'exposed' },
    pinnedForm: null,
    form: buildToolForm(),
    hash: 'sha256:b',
    nameRefusal: null,
  });

  expect(decision).toStrictEqual({
    state: 'exposed',
    pinnedHash: 'sha256:b',
    latestHash: 'sha256:b',
    move: { fromHash: 'sha256:a', toHash: 'sha256:b', cause: 'forgotten' },
    propose: null,
    notice: null,
    hiddenReason: null,
  });
});

test('it exposes a stopped tool again when the server returns to the pinned form', () => {
  const decision = decidePin({
    existing: { pinnedHash: 'sha256:a', latestHash: 'sha256:b', state: 'stopped_changed' },
    pinnedForm: buildToolForm(),
    form: buildToolForm(),
    hash: 'sha256:a',
    nameRefusal: null,
  });

  expect(decision).toStrictEqual({
    state: 'exposed',
    pinnedHash: 'sha256:a',
    latestHash: 'sha256:a',
    move: null,
    propose: null,
    notice: null,
    hiddenReason: null,
  });
});

test('it keeps the pin of a tool that the listing no longer holds', () => {
  const decision = decideMissingPin({
    pinnedHash: 'sha256:a',
    latestHash: 'sha256:a',
    state: 'exposed',
  });

  expect(decision).toStrictEqual({
    state: 'removed',
    pinnedHash: 'sha256:a',
    latestHash: 'sha256:a',
    move: null,
    propose: null,
    notice: { kind: 'tool_removed', fromHash: 'sha256:a', toHash: null },
    hiddenReason: null,
  });
});
