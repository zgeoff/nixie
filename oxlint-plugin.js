// nixie's own lint rules, loaded through oxlint's jsPlugins (ESLint v9 rule API)

const message =
  'Load a module through a static import or an import() of a string literal, so no-restricted-imports sees its specifier.';

const selectors = [
  // a template literal, even one with no substitutions, hides the specifier from no-restricted-imports
  "ImportExpression:not([source.type='Literal'])",
  "MemberExpression[object.type='MetaProperty'][property.name='require']",
];

// The testing skill's structure rules for a bun:test file. oxlint's jest and vitest rules see only
// their own runners' imports, so they miss every one of these in a bun:test file.
const testMessages = {
  describe: 'Write each test as a top-level test() call; describe is banned.',
  hook: 'Per-test setup belongs to setupTest() and cleanup to onTestFinished(); {{name}} is banned.',
  title: 'A test title starts with "it " or with a "#<unit> " prefix.',
  toEqual: 'Use toStrictEqual, or toMatchObject for a partial match; toEqual is banned.',
};

const hooks = new Set(['beforeAll', 'beforeEach', 'afterAll', 'afterEach']);

// a unit may be a dotted procedure path, such as #sessions.enrol
const titlePattern = /^(?:it |#\w+(?:\.\w+)* )/u;

// test(…), test.skip(…) and the like, and the call that test.each(…) or test.skipIf(…) returns
function isTestCallee(callee) {
  if (callee.type === 'Identifier') {
    return callee.name === 'test';
  }
  if (callee.type === 'MemberExpression') {
    return callee.object.type === 'Identifier' && callee.object.name === 'test';
  }
  return callee.type === 'CallExpression' && isTestCallee(callee.callee);
}

// the text a title starts with, or null for a title that is not written out
function readTitleStart(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === 'TemplateLiteral') {
    return node.quasis[0]?.value.cooked ?? '';
  }
  return null;
}

function checkCall(context, node) {
  const callee = node.callee;
  const name = callee.type === 'MemberExpression' ? callee.object.name : callee.name;

  if (name === 'describe') {
    context.report({ node, messageId: 'describe' });
  } else if (hooks.has(name)) {
    context.report({ node, messageId: 'hook', data: { name } });
  } else if (isTestCallee(callee)) {
    const title = readTitleStart(node.arguments[0]);

    if (title !== null && !titlePattern.test(title)) {
      context.report({ node: node.arguments[0], messageId: 'title' });
    }
  }
}

const plugin = {
  meta: { name: 'nixie' },
  rules: {
    'no-hidden-import': {
      meta: { type: 'problem', messages: { hidden: message }, schema: [] },
      create(context) {
        const emitHiddenImport = (node) => context.report({ node, messageId: 'hidden' });

        return Object.fromEntries(selectors.map((selector) => [selector, emitHiddenImport]));
      },
    },
    'test-shape': {
      meta: { type: 'problem', messages: testMessages, schema: [] },
      create(context) {
        return {
          CallExpression: (node) => {
            checkCall(context, node);
          },
          "MemberExpression[property.name='toEqual']": (node) => {
            context.report({ node: node.property, messageId: 'toEqual' });
          },
        };
      },
    },
  },
};

export default plugin;
