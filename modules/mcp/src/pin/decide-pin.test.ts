import { expect, test } from 'bun:test';
import { buildToolForm } from '../test-utils/build-tool-form';
import { decideMissingPin, decidePin } from './decide-pin';

test('it exposes a tool whose hash equals its pin', () => {
  const decision = decidePin({
    isTrusted: false,
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
    hasNotice: false,
    hiddenReason: null,
  });
});

test('it stops a changed tool of an untrusted server and proposes its allow', () => {
  const decision = decidePin({
    isTrusted: false,
    existing: { pinnedHash: 'sha256:a', latestHash: 'sha256:a', state: 'exposed' },
    pinnedForm: buildToolForm(),
    form: buildToolForm({ description: 'Read one item and mail it.' }),
    hash: 'sha256:b',
    nameRefusal: null,
  });

  expect(decision).toStrictEqual({
    state: 'stopped_changed',
    pinnedHash: 'sha256:a',
    latestHash: 'sha256:b',
    move: null,
    propose: { fromHash: 'sha256:a', hash: 'sha256:b' },
    hasNotice: false,
    hiddenReason: null,
  });
});

test('it moves the pin of a changed tool of a trusted server, with a notice', () => {
  const decision = decidePin({
    isTrusted: true,
    existing: { pinnedHash: 'sha256:a', latestHash: 'sha256:a', state: 'exposed' },
    pinnedForm: buildToolForm(),
    form: buildToolForm({ description: 'Read one item and mail it.' }),
    hash: 'sha256:b',
    nameRefusal: null,
  });

  expect(decision).toStrictEqual({
    state: 'exposed',
    pinnedHash: 'sha256:b',
    latestHash: 'sha256:b',
    move: { fromHash: 'sha256:a', toHash: 'sha256:b', cause: 'trusted_change' },
    propose: null,
    hasNotice: true,
    hiddenReason: null,
  });
});

test('it stops a trusted server tool that gains an input property', () => {
  const decision = decidePin({
    isTrusted: true,
    existing: { pinnedHash: 'sha256:a', latestHash: 'sha256:a', state: 'exposed' },
    pinnedForm: buildToolForm(),
    form: buildToolForm({
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' }, notify: { type: 'string' } },
      },
    }),
    hash: 'sha256:b',
    nameRefusal: null,
  });

  expect(decision).toMatchObject({
    state: 'stopped_changed',
    pinnedHash: 'sha256:a',
    move: null,
    propose: { fromHash: 'sha256:a', hash: 'sha256:b' },
  });
});

test.each([true, false])(
  'it keeps a new tool hidden and proposes its allow when the server is trusted: %p',
  (isTrusted) => {
    const decision = decidePin({
      isTrusted,
      existing: null,
      pinnedForm: null,
      form: buildToolForm(),
      hash: 'sha256:a',
      nameRefusal: null,
    });

    expect(decision).toStrictEqual({
      state: 'hidden_new',
      pinnedHash: null,
      latestHash: 'sha256:a',
      move: null,
      propose: { fromHash: null, hash: 'sha256:a' },
      hasNotice: false,
      hiddenReason: null,
    });
  },
);

test('it proposes nothing again for a hidden tool whose form did not change', () => {
  const decision = decidePin({
    isTrusted: false,
    existing: { pinnedHash: null, latestHash: 'sha256:a', state: 'hidden_new' },
    pinnedForm: null,
    form: buildToolForm(),
    hash: 'sha256:a',
    nameRefusal: null,
  });

  expect(decision.propose).toBeNull();
});

test('it proposes again for a hidden tool whose form changed', () => {
  const decision = decidePin({
    isTrusted: false,
    existing: { pinnedHash: null, latestHash: 'sha256:a', state: 'hidden_new' },
    pinnedForm: null,
    form: buildToolForm(),
    hash: 'sha256:b',
    nameRefusal: null,
  });

  expect(decision.propose).toStrictEqual({ fromHash: null, hash: 'sha256:b' });
});

test('it keeps a tool hidden, with the reason, when its name is refused', () => {
  const decision = decidePin({
    isTrusted: false,
    existing: null,
    pinnedForm: null,
    form: buildToolForm(),
    hash: 'sha256:a',
    nameRefusal: 'its name is longer than the model allows',
  });

  expect(decision).toMatchObject({
    state: 'hidden_new',
    propose: null,
    hiddenReason: 'its name is longer than the model allows',
  });
});

test('it hides a tool whose pinned form a forget erased and proposes its latest form', () => {
  const decision = decidePin({
    isTrusted: true,
    existing: { pinnedHash: 'sha256:a', latestHash: 'sha256:a', state: 'exposed' },
    pinnedForm: null,
    form: buildToolForm(),
    hash: 'sha256:b',
    nameRefusal: null,
  });

  expect(decision).toMatchObject({
    state: 'hidden_new',
    pinnedHash: null,
    move: { fromHash: 'sha256:a', toHash: null, cause: 'forgotten' },
    propose: { fromHash: null, hash: 'sha256:b' },
  });
});

test('it exposes a stopped tool again when the server returns to the pinned form', () => {
  const decision = decidePin({
    isTrusted: false,
    existing: { pinnedHash: 'sha256:a', latestHash: 'sha256:b', state: 'stopped_changed' },
    pinnedForm: buildToolForm(),
    form: buildToolForm(),
    hash: 'sha256:a',
    nameRefusal: null,
  });

  expect(decision).toMatchObject({ state: 'exposed', move: null, propose: null });
});

test('it keeps the pin of a tool that the listing no longer holds', () => {
  const decision = decideMissingPin({
    pinnedHash: 'sha256:a',
    latestHash: 'sha256:a',
    state: 'exposed',
  });

  expect(decision).toMatchObject({
    state: 'removed',
    pinnedHash: 'sha256:a',
    latestHash: 'sha256:a',
    hasNotice: true,
  });
});
