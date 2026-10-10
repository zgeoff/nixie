// nixie's own lint rules, loaded through oxlint's jsPlugins (ESLint v9 rule API)

const message =
  'Load a module through a static import or an import() of a string literal, so no-restricted-imports sees its specifier.';

const selectors = [
  // a template literal, even one with no substitutions, hides the specifier from no-restricted-imports
  "ImportExpression:not([source.type='Literal'])",
  "MemberExpression[object.type='MetaProperty'][property.name='require']",
];

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
  },
};

export default plugin;
