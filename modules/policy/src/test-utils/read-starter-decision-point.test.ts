import { expect, test } from 'bun:test';
import { buildPolicyCall } from './build-policy-call';
import { readStarterDecisionPoint } from './read-starter-decision-point';

test('it asks before a sandbox task start with memory read and no persona, under the starter rule', async () => {
  const decide = readStarterDecisionPoint(() => ({
    effects: ['note'],
    destinations: [],
    amount: null,
    content: ['name', 'brief'],
    results: {},
  }));

  const decided = await decide(
    buildPolicyCall({
      tool: 'task.start/sandbox',
      toolList: ['task.start'],
      args: { persona: 'none', memory: 'read' },
    }),
  );

  expect(decided.decision).toMatchObject({
    outcome: 'ask',
    cause: 'ask_rule',
    rule: { id: 'ask-stranger-with-memory' },
  });
});

test('it asks before computer.take_back, which no starter rule allows', async () => {
  const decide = readStarterDecisionPoint(() => ({
    effects: ['computer_take_back'],
    destinations: [],
    amount: null,
    content: [],
    results: {},
  }));

  const decided = await decide(
    buildPolicyCall({ tool: 'computer.take_back', toolList: ['computer.take_back'], args: {} }),
  );

  expect(decided.decision.outcome).toBe('ask');
});

test('it allows a sandbox task start that keeps the persona, under the starter rule for notes', async () => {
  const decide = readStarterDecisionPoint(() => ({
    effects: ['note'],
    destinations: [],
    amount: null,
    content: ['name', 'brief'],
    results: {},
  }));

  const decided = await decide(
    buildPolicyCall({
      tool: 'task.start/sandbox',
      toolList: ['task.start'],
      args: { persona: 'default', memory: 'read' },
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'allow', rule: { id: 'allow-notes' } });
});

test('it allows task.close with no approval, under the starter rule for notes', async () => {
  const decide = readStarterDecisionPoint(() => ({
    effects: ['note'],
    destinations: [],
    amount: null,
    content: [],
    results: {},
  }));

  const decided = await decide(
    buildPolicyCall({
      tool: 'task.close',
      toolList: ['task.close'],
      args: { taskID: 'k3x9m2p7qa' },
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'allow', rule: { id: 'allow-notes' } });
});

test.each<[string, string]>([
  ['ls', 'ls'],
  ['ls -la /var/log', 'ls'],
  ['pwd', 'pwd'],
  ['cat notes.txt', 'cat'],
  ['df -h', 'df'],
  ['which git', 'which'],
  ['head -n 5 notes.txt', 'head'],
  ['tail -n 20 build.log', 'tail'],
  ['wc -l notes.txt', 'wc'],
  ['grep -rn todo .', 'grep'],
  ['du -sh .', 'du'],
  ['stat notes.txt', 'stat'],
  ["grep -r 'two words' .", 'grep'],
  ['ls -l | ls', 'ls'],
  ['cat notes.txt && cat build.log', 'cat'],
])('it allows the read-only command %s under the starter rule for %s', async (command, name) => {
  const decide = readStarterDecisionPoint(() => ({
    effects: ['computer_run'],
    destinations: [],
    amount: null,
    content: ['command'],
    results: {},
  }));

  const decided = await decide(
    buildPolicyCall({ tool: 'computer.run', toolList: ['computer.run'], args: { command } }),
  );

  expect(decided.decision).toMatchObject({
    outcome: 'allow',
    rule: { id: `allow-shell-${name}` },
  });
});

test.each<[string, string]>([
  ['ls > out.txt', 'a redirection'],
  ['ls >> out.txt', 'an appending redirection'],
  ['ls 2> err.txt', 'a redirection of stderr'],
  ['ls &> all.txt', 'a redirection of both streams'],
  ['cat <<< hello', 'a here-string'],
  ['cat <<END\nhello\nEND', 'a here-doc'],
  ['ls | tee out.txt', 'a pipe into tee'],
  ['ls | sh', 'a pipe into a shell'],
  ['ls | xargs rm', 'a pipe into xargs'],
  ['ls |& grep draft', 'a pipe of both streams'],
  ['cat $(echo notes.txt)', 'a command substitution'],
  ['cat `echo notes.txt`', 'a backtick substitution'],
  ['cat <(ls)', 'a process substitution'],
  ['ls {x}>(touch notes.txt)', 'a process substitution glued to a word'],
  ['ls; rm notes.txt', 'a ; before another command'],
  ['ls && rm notes.txt', 'an && before another command'],
  ['ls || rm notes.txt', 'an || before another command'],
  ['ls\nrm notes.txt', 'a second line'],
  ['ls &', 'a background job'],
  ['(ls)', 'a subshell'],
  ['{ ls; }', 'a group'],
  ['env ls', 'an env wrapper'],
  ['xargs ls', 'an xargs wrapper'],
  ['sudo ls', 'a sudo wrapper'],
  ["sh -c 'ls'", 'an sh -c wrapper'],
  ['bash -c ls', 'a bash -c wrapper'],
  ['FOO=1 ls', 'a variable assignment'],
  ['ls $HOME', 'a variable expansion'],
  ['"ls x" notes', 'a quoted command name with a space'],
  ['rm notes.txt', 'a command off the list'],
  ['/bin/ls', 'a command named by its path'],
  ["find . -name '*.md'", 'find, which the rules leave out'],
  ['find . -exec rm {} +', 'find with -exec'],
  ["find . -ex'ec' rm {} +", 'find with a quoted -exec'],
  ['find -exec rm {} +', 'find with -exec and no start path'],
  [String.raw`find . -execdir rm {} \;`, 'find with -execdir'],
  ['find . -delete', 'find with -delete'],
  [String.raw`find . -ok rm {} \;`, 'find with -ok'],
  [String.raw`find . -okdir rm {} \;`, 'find with -okdir'],
  ['find . -fprint out.txt', 'find with -fprint'],
  ['find . -fprint0 out.txt', 'find with -fprint0'],
  ['find . -fprintf out.txt %p', 'find with -fprintf'],
  ['find . -fls out.txt', 'find with -fls'],
  ['file -zS archive.Z', 'file, which -z lets run a decompressor'],
  ['file -p notes.txt', 'file, which -p lets rewrite the times'],
  ['ls | grep draft', 'a pipe between 2 listed commands'],
  ['ls && pwd', 'a chain of 2 listed commands'],
])('it asks before the command %s, %s, under the starter rules', async (command) => {
  const decide = readStarterDecisionPoint(() => ({
    effects: ['computer_run'],
    destinations: [],
    amount: null,
    content: ['command'],
    results: {},
  }));

  const decided = await decide(
    buildPolicyCall({ tool: 'computer.run', toolList: ['computer.run'], args: { command } }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'ask' });
});
