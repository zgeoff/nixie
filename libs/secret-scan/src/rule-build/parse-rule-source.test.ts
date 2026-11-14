import { expect, test } from 'bun:test';
import { scanRuleSource } from '../test-utils/scan-rule-source';
import { parseRuleSource } from './parse-rule-source';

test('it discards a finding whose secret has low entropy', () => {
  const source = `
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
filter = '''
entropy(finding["secret"]) < 2.0
'''
`;

  expect([
    scanRuleSource(source, 'tok_aaaaaaaaab'),
    scanRuleSource(source, 'tok_qwertyuiop'),
  ]).toStrictEqual([null, { rule: 'tok' }]);
});

test('it keeps a finding whose entropy equals a strict limit and discards one that equals an inclusive limit', () => {
  const strict = `
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
filter = '''
entropy(finding["secret"]) < 1.0
'''
`;

  const inclusive = strict.replace('< 1.0', '<= 1.0');

  expect([
    scanRuleSource(strict, 'tok_abababab'),
    scanRuleSource(inclusive, 'tok_abababab'),
  ]).toStrictEqual([{ rule: 'tok' }, null]);
});

test('it discards a finding that a matchesAny clause on the secret matches', () => {
  const source = `
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
filter = '''
filter.matchesAny(finding["secret"], [\`^demo\`, \`^test\`])
'''
`;

  expect([
    scanRuleSource(source, 'tok_demokey'),
    scanRuleSource(source, 'tok_livekey'),
  ]).toStrictEqual([null, { rule: 'tok' }]);
});

test('it discards a finding that a matchesAny clause on the match matches', () => {
  const source = `
[[rules]]
id = "tok"
regex = '''(tok|pre)_([a-z]+)'''
filter = '''
matchesAny(finding["match"], [\`^pre_\`])
'''
`;

  expect([
    scanRuleSource(source, 'pre_livekey'),
    scanRuleSource(source, 'tok_livekey'),
  ]).toStrictEqual([null, { rule: 'tok' }]);
});

test('it discards a finding that a negated matchesAny clause does not match', () => {
  const source = `
[[rules]]
id = "tok"
regex = '''tok_([a-z0-9]+)'''
filter = '''
!matchesAny(finding["secret"], [\`^[a-z]+[0-9]\`])
'''
`;

  expect([scanRuleSource(source, 'tok_abc'), scanRuleSource(source, 'tok_abc7')]).toStrictEqual([
    null,
    { rule: 'tok' },
  ]);
});

test('it discards a finding that a containsAny clause finds a string in', () => {
  const source = `
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
filter = '''
filter.containsAny(finding["secret"], ["example", "sample"])
'''
`;

  expect([
    scanRuleSource(source, 'tok_myexample'),
    scanRuleSource(source, 'tok_mykey'),
  ]).toStrictEqual([null, { rule: 'tok' }]);
});

test('it applies the top-level filter to every rule', () => {
  const source = `
filter = '''
containsAny(finding["secret"], ["placeholder"])
'''

[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
`;

  expect([
    scanRuleSource(source, 'tok_placeholder'),
    scanRuleSource(source, 'tok_mykey'),
  ]).toStrictEqual([null, { rule: 'tok' }]);
});

test('it takes the secret from the secret group, then the first capture, then the whole match', () => {
  const group = `
[[rules]]
id = "grouped"
regex = '''(a)(b[a-z]+)'''
secretGroup = 2
filter = '''
containsAny(finding["secret"], ["bad"])
'''
`;

  const first = group.replace('secretGroup = 2\n', '');
  const whole = group.replace('(a)(b[a-z]+)', 'ab[a-z]+').replace('secretGroup = 2\n', '');

  expect([
    scanRuleSource(group, 'abbad'),
    scanRuleSource(first, 'abbad'),
    scanRuleSource(first, 'abgood'),
    scanRuleSource(whole, 'abbad'),
  ]).toStrictEqual([null, { rule: 'grouped' }, { rule: 'grouped' }, null]);
});

test('it drops a tokenRatio clause and lists it for the header', () => {
  const parsed = parseRuleSource(`
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
filter = '''
filter.entropy(finding["secret"]) < 2.0 || filter.tokenRatio(finding["secret"]) >= 2.5
'''
`);

  expect(parsed.dropped).toStrictEqual([
    { ruleID: 'tok', clause: 'filter.tokenRatio(finding["secret"]) >= 2.5' },
  ]);

  expect(parsed.rules[0]?.filter).toStrictEqual([
    { kind: 'entropy', limit: 2, isInclusive: false },
  ]);
});

test('it drops a clause that reads the file path', () => {
  const parsed = parseRuleSource(`
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
filter = '''
matchesAny(attributes["path"], [\`\\.md$\`])
'''
`);

  expect(parsed.dropped).toStrictEqual([
    { ruleID: 'tok', clause: 'matchesAny(attributes["path"], [`\\.md$`])' },
  ]);
});

test('it drops a conjunction that holds a clause it cannot evaluate', () => {
  const parsed = parseRuleSource(`
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
filter = '''
matchesAny(finding["secret"], [\`^x\`]) && containsAny(finding["line"], ["d"])
'''
`);

  expect([parsed.rules[0]?.filter, parsed.dropped]).toStrictEqual([
    undefined,
    [
      {
        ruleID: 'tok',
        clause: 'matchesAny(finding["secret"], [`^x`]) && containsAny(finding["line"], ["d"])',
      },
    ],
  ]);
});

test('it discards on a conjunction of clauses that it can evaluate', () => {
  const source = `
[[rules]]
id = "tok"
regex = '''(tok|pre)_([a-z]+)'''
secretGroup = 2
filter = '''
matchesAny(finding["secret"], [\`^demo\`]) && containsAny(finding["match"], ["pre_"])
'''
`;

  expect([
    scanRuleSource(source, 'pre_demokey'),
    scanRuleSource(source, 'tok_demokey'),
  ]).toStrictEqual([null, { rule: 'tok' }]);
});

test('it fails the build on a clause of a shape it cannot classify', () => {
  expect(() =>
    parseRuleSource(`
[[rules]]
id = "odd-rule"
regex = '''tok_([a-z]+)'''
filter = '''
finding["secret"].startsWith("demo")
'''
`),
  ).toThrowWithMessage(Error, /rule odd-rule: cannot classify the filter clause/u);
});

test('it keeps the recognised disjuncts of a scripted filter', () => {
  const source = `
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
filter = '''
// a comment with an apostrophe: it's ignored
let isDemo = filter.matchesAny(finding["secret"], [\`^demo\`]);
let isDocsFile = filter.matchesAny(attributes["path"], [\`\\.md$\`]);
let level = isDemo ? "low" : "medium";
let _ = filter.setConfidence(level);

isDemo
|| isDocsFile
|| filter.tokenRatio(finding["secret"]) >= 2.5
|| filter.containsAny(finding["secret"], ["sample"])
'''
`;

  const parsed = parseRuleSource(source);

  expect([
    scanRuleSource(source, 'tok_demokey'),
    scanRuleSource(source, 'tok_mysample'),
    scanRuleSource(source, 'tok_mykey'),
  ]).toStrictEqual([null, null, { rule: 'tok' }]);

  expect(parsed.dropped.map((entry) => entry.clause)).toStrictEqual([
    'filter.matchesAny(attributes["path"], [`\\.md$`])',
    'filter.tokenRatio(finding["secret"]) >= 2.5',
  ]);
});

test('it drops a clause on a value built from the surrounding text', () => {
  const parsed = parseRuleSource(`
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
filter = '''
let around = finding["fragment_raw"][0:10];
filter.matchesAny(around, [\`^demo\`])
'''
`);

  expect(parsed.dropped).toStrictEqual([
    { ruleID: 'tok', clause: 'filter.matchesAny(around, [`^demo`])' },
  ]);
});

test('it reports a rule only when its companion rule also matches', () => {
  const source = `
[[rules]]
id = "main"
regex = '''main_([a-z]+)'''
components = [
  { id = "partner", within = "5L" },
]

[[rules]]
id = "partner"
regex = '''partner_([a-z]+)'''
skipReport = true
`;

  expect([
    scanRuleSource(source, 'main_abc'),
    scanRuleSource(source, 'partner_abc'),
    scanRuleSource(source, 'main_abc&partner_abc'),
  ]).toStrictEqual([null, null, { rule: 'main' }]);
});

test('it ignores an optional companion', () => {
  const source = `
[[rules]]
id = "main"
regex = '''main_([a-z]+)'''
components = [
  { id = "partner", optional = true },
]

[[rules]]
id = "partner"
regex = '''partner_([a-z]+)'''
`;

  expect(scanRuleSource(source, 'main_abc')).toStrictEqual({ rule: 'main' });
});

test('it never reports a skipReport rule on its own', () => {
  expect(
    scanRuleSource(
      `
[[rules]]
id = "partner"
regex = '''partner_([a-z]+)'''
skipReport = true
`,
      'partner_abc',
    ),
  ).toBeNull();
});

test('it leaves out a rule with a path and a rule with no regex', () => {
  const parsed = parseRuleSource(`
[[rules]]
id = "by-path"
regex = '''x_([a-z]+)'''
path = '''\\.p12$'''

[[rules]]
id = "no-regex"

[[rules]]
id = "kept"
regex = '''kept_([a-z]+)'''
`);

  expect([parsed.rules.map((rule) => rule.id), parsed.leftOut]).toStrictEqual([
    ['kept'],
    [
      { ruleID: 'by-path', reason: 'it matches a file path' },
      { ruleID: 'no-regex', reason: 'it has no regex' },
    ],
  ]);
});

test('it copies no validate script', () => {
  const parsed = parseRuleSource(`
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
validate = '''
http.get("https://api.host.test/check")
'''
`);

  expect(parsed.rules).toStrictEqual([{ id: 'tok', regex: 'tok_([a-z]+)' }]);
});

test('it lowercases keywords and gates a rule on them', () => {
  const source = `
[[rules]]
id = "tok"
regex = '''(?i)[a-z]+_([a-z]+)'''
keywords = ["KEYWORD"]
`;

  expect([
    scanRuleSource(source, 'plain_abc'),
    scanRuleSource(source, 'keyword_abc'),
  ]).toStrictEqual([null, { rule: 'tok' }]);
});

test('it fails the build on a pattern that does not compile on re2js', () => {
  expect(() =>
    parseRuleSource(`
[[rules]]
id = "backtracking"
regex = '''(?=look)ahead'''
`),
  ).toThrowWithMessage(Error, /rule backtracking: a pattern does not compile on re2js/u);
});
