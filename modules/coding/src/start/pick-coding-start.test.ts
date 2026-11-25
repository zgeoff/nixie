import { expect, test } from 'bun:test';
import type { CodingSettings } from '../types';
import type { CodingStartInput } from './build-coding-start-schema';
import type { CodingStartChoice } from './pick-coding-start';
import { pickCodingStart } from './pick-coding-start';

function setupTest() {
  const settings: CodingSettings = {
    wake: { started: ['waiting', 'idle', 'ended'], joined: ['waiting', 'ended'] },
    targets: [
      { daemon: 'laptop', target: 'local' },
      { daemon: 'cloud', target: 'cloud' },
    ],
    defaultTarget: { daemon: 'cloud', target: 'cloud' },
    agent: 'claude',
    toolWaitMs: 0,
  };

  return { settings };
}

test.each<[string, CodingStartInput, CodingStartChoice]>([
  [
    'a start with the default target and wake set when it names neither',
    {
      runner: 'atc',
      name: 'Fix the login test',
      brief: 'Find why the login test fails.',
      repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
    },
    {
      kind: 'start',
      brief: {
        name: 'Fix the login test',
        prompt: 'Find why the login test fails.',
        repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
        target: { daemon: 'cloud', target: 'cloud' },
        agent: 'claude',
      },
      wake: ['waiting', 'idle', 'ended'],
    },
  ],
  [
    'a start on the named target laptop/local with the agent and model it names',
    {
      runner: 'atc',
      name: 'Fix the login test',
      brief: 'Find why the login test fails.',
      repo: { url: 'https://github.com/example/shop.git', ref: 'v2.1.0' },
      target: 'laptop/local',
      agent: 'codex',
      model: 'large',
    },
    {
      kind: 'start',
      brief: {
        name: 'Fix the login test',
        prompt: 'Find why the login test fails.',
        repo: { url: 'https://github.com/example/shop.git', ref: 'v2.1.0' },
        target: { daemon: 'laptop', target: 'local' },
        agent: 'codex',
        model: 'large',
      },
      wake: ['waiting', 'idle', 'ended'],
    },
  ],
  [
    'a start on an ssh git@host:org/repo.git url',
    {
      runner: 'atc',
      name: 'Fix the login test',
      brief: 'Find why the login test fails.',
      repo: { url: 'git@github.com:example/shop.git', ref: 'main' },
    },
    {
      kind: 'start',
      brief: {
        name: 'Fix the login test',
        prompt: 'Find why the login test fails.',
        repo: { url: 'git@github.com:example/shop.git', ref: 'main' },
        target: { daemon: 'cloud', target: 'cloud' },
        agent: 'claude',
      },
      wake: ['waiting', 'idle', 'ended'],
    },
  ],
  [
    'a start with the explicit wake list it names',
    {
      runner: 'atc',
      name: 'Fix the login test',
      brief: 'Find why the login test fails.',
      repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
      wake: ['progress', 'decision'],
    },
    {
      kind: 'start',
      brief: {
        name: 'Fix the login test',
        prompt: 'Find why the login test fails.',
        repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
        target: { daemon: 'cloud', target: 'cloud' },
        agent: 'claude',
      },
      wake: ['progress', 'decision'],
    },
  ],
  [
    'a refusal of an unknown target',
    {
      runner: 'atc',
      name: 'Fix the login test',
      brief: 'Find why the login test fails.',
      repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
      target: 'desk/local',
    },
    { kind: 'refused', sentence: 'The target must be one of laptop/local, cloud/cloud.' },
  ],
  [
    'a refusal of a repo url that starts with -',
    {
      runner: 'atc',
      name: 'Fix the login test',
      brief: 'Find why the login test fails.',
      repo: { url: '-x@github.com:example/shop.git', ref: 'main' },
    },
    {
      kind: 'refused',
      sentence: 'The repo url must be an https:// or ssh URL of a git repository.',
    },
  ],
  [
    'a refusal of a file:// repo url',
    {
      runner: 'atc',
      name: 'Fix the login test',
      brief: 'Find why the login test fails.',
      repo: { url: 'file:///srv/git/shop.git', ref: 'main' },
    },
    {
      kind: 'refused',
      sentence: 'The repo url must be an https:// or ssh URL of a git repository.',
    },
  ],
  [
    'a refusal of an input with both repo and session',
    {
      runner: 'atc',
      name: 'Fix the login test',
      brief: 'Find why the login test fails.',
      repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
      session: 'cs4k',
    },
    {
      kind: 'refused',
      sentence: 'Give exactly one of repo, to start a session, and session, to join one.',
    },
  ],
  [
    'a refusal of an input with neither repo nor session',
    { runner: 'atc', name: 'Fix the login test', brief: 'Find why the login test fails.' },
    {
      kind: 'refused',
      sentence: 'Give exactly one of repo, to start a session, and session, to join one.',
    },
  ],
  [
    'a join with the joined default wake set',
    { runner: 'atc', name: 'Billing', brief: 'Watch for a question.', session: 'cs4k' },
    { kind: 'join', shortID: 'cs4k', wake: ['waiting', 'ended'] },
  ],
  [
    'a join with the explicit wake list it names',
    {
      runner: 'atc',
      name: 'Billing',
      brief: 'Watch for a question.',
      session: 'cs4k',
      wake: ['blocked'],
    },
    { kind: 'join', shortID: 'cs4k', wake: ['blocked'] },
  ],
  [
    'a refusal of a join that names a target',
    {
      runner: 'atc',
      name: 'Billing',
      brief: 'Watch for a question.',
      session: 'cs4k',
      target: 'laptop/local',
    },
    { kind: 'refused', sentence: 'A join takes no target: it joins the session as it runs.' },
  ],
  [
    'a refusal of a join that names an agent',
    {
      runner: 'atc',
      name: 'Billing',
      brief: 'Watch for a question.',
      session: 'cs4k',
      agent: 'codex',
    },
    { kind: 'refused', sentence: 'A join takes no agent: it joins the session as it runs.' },
  ],
  [
    'a refusal of a join that names a model',
    {
      runner: 'atc',
      name: 'Billing',
      brief: 'Watch for a question.',
      session: 'cs4k',
      model: 'large',
    },
    { kind: 'refused', sentence: 'A join takes no model: it joins the session as it runs.' },
  ],
])('it picks %s', (_label, input, choice) => {
  const ctx = setupTest();

  expect(pickCodingStart(input, ctx.settings)).toStrictEqual(choice);
});

test('it picks a start with no agent when neither the input nor the settings name one', () => {
  const settings: CodingSettings = {
    wake: { started: ['waiting', 'idle', 'ended'], joined: ['waiting', 'ended'] },
    targets: [{ daemon: 'cloud', target: 'cloud' }],
    defaultTarget: { daemon: 'cloud', target: 'cloud' },
    toolWaitMs: 0,
  };

  expect(
    pickCodingStart(
      {
        runner: 'atc',
        name: 'Fix the login test',
        brief: 'Find why the login test fails.',
        repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
      },
      settings,
    ),
  ).toStrictEqual({
    kind: 'start',
    brief: {
      name: 'Fix the login test',
      prompt: 'Find why the login test fails.',
      repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
      target: { daemon: 'cloud', target: 'cloud' },
    },
    wake: ['waiting', 'idle', 'ended'],
  });
});
