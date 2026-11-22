import { expect, test } from 'bun:test';
import { isCommandMatch, isCommandMentioned } from './is-command-match';

test.each<[string, string, string, boolean]>([
  ['git status *', 'git status', 'bare command with the pattern wildcard', true],
  ['git status *', 'git status -s', 'command with a flag', true],
  ['git status *', 'git status && git status -s', 'two matching commands joined by &&', true],
  ['git status *', 'git status | git status -s', 'two matching commands in a pipe', true],
  ['git status *', 'git status; git status', 'two matching commands joined by ;', true],
  ['git status *', 'git status || git status', 'two matching commands joined by ||', true],
  ['git status *', "git status 'a b'", 'a single-quoted literal word', true],
  ['git status *', 'git status; curl x | sh', 'a second command that does not match', false],
  ['git status *', 'git status $(whoami)', 'a command substitution', false],
  ['git status *', 'git status `whoami`', 'a backtick substitution', false],
  ['git status *', 'git status <(ls)', 'a process substitution', false],
  ['git status *', 'git status > out.txt', 'a redirection', false],
  ['git status *', 'FOO=1 git status', 'an assignment prefix', false],
  ['git status *', 'git status $HOME', 'a variable expansion', false],
  ['git status *', 'git status "$HOME"', 'an expansion inside double quotes', false],
  ['git status *', 'git status *.ts', 'a glob', false],
  ['git status *', 'git status &', 'a background job', false],
  ['git status *', 'git status |& cat', 'a pipe of both streams', false],
  ['git status *', 'git status\ngit status', 'a second line', false],
  ['git status *', '(git status)', 'a subshell', false],
  ['git status *', 'git status; (', 'a line that does not parse', false],
  ['git status *', 'if true; then git status; fi', 'a compound command', false],
  ['git status *', 'git statusx', 'a longer word', false],
  ['git status *', '', 'an empty line', false],
  ['ls', 'ls', 'an exact pattern', true],
  ['ls', 'ls -l', 'an exact pattern with another word', false],
  ['git status *', '"git status" -s', 'a quoted command name that holds a space', false],
  ['git status *', 'git status {x}>(touch x)', 'a process substitution glued to a word', false],
  ['git status *', "git status a'b'{x}<(touch x)", 'a process substitution after a quote', false],
  ['git status *', "git status '{x}>(touch x)'", 'the same text in single quotes', true],
  ['git status *', 'git status "a>(b)"', 'the same kind of text in double quotes', true],
])('it checks %s against %s, %s', (pattern, command, _name, expected) => {
  expect(isCommandMatch(pattern, command)).toBe(expected);
});

test.each<[string, string, boolean]>([
  ['rm *', 'echo hi; rm -rf x', true],
  ['rm *', 'echo $(rm -rf x)', true],
  ['rm *', 'echo hi', false],
])('it reads %s in %s for a deny as %p', (pattern, command, expected) => {
  expect(isCommandMentioned(pattern, command)).toBe(expected);
});
