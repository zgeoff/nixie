// The secrets file's groups reach code only through the credentials module, which resolves a
// reference to an entry and reads its value. Any other read of a group goes around the one place
// that keeps each value out of the model, the log and every error.
const nixiePlugin = {
  meta: { name: 'nixie' },
  rules: { 'no-credential-group-reads': buildRule() },
};

export default nixiePlugin;

const groups = new Set(['model_credentials', 'connector_credentials']);
const secretsNames = new Set(['secrets', 'secretsFile']);
const settingsOnly = new Set(['settings']);

function buildRule() {
  return {
    meta: {
      type: 'problem',
      messages: {
        banned:
          'Read a credential through the credentials module, not from the secrets file group `{{group}}`: resolve the reference with `resolveCredential`, then fetch or grant it through the store.',
      },
      schema: [],
    },
    create(context) {
      const report = (node, group) => {
        context.report({ node, messageId: 'banned', data: { group } });
      };

      // the names that hold a secrets object: the ones its owners use, and each name one is copied to
      const aliases = new Set(secretsNames);

      return {
        MemberExpression(node) {
          const group = findGroup(node, aliases);

          if (group !== null) {
            report(node, group);
          }
        },
        VariableDeclarator(node) {
          if (node.id.type === 'ObjectPattern') {
            collectPatternAliases(node.id, aliases);
          }

          if (node.init === null || !isSecretsObject(node.init, aliases)) {
            return;
          }

          if (node.id.type === 'Identifier') {
            aliases.add(node.id.name);
          } else if (node.id.type === 'ObjectPattern') {
            reportPattern(node.id, settingsOnly, report);
          }
        },
        AssignmentExpression(node) {
          if (node.left.type === 'ObjectPattern') {
            collectPatternAliases(node.left, aliases);
          }

          if (!isSecretsObject(node.right, aliases)) {
            return;
          }

          if (node.left.type === 'Identifier') {
            aliases.add(node.left.name);
          } else if (node.left.type === 'ObjectPattern') {
            reportPattern(node.left, settingsOnly, report);
          }
        },
        ObjectPattern(node) {
          reportPattern(node, groups, report);
        },
      };
    },
  };
}

function findGroup(node, aliases) {
  const name = findPropertyName(node);

  if (name === null) {
    return null;
  }

  if (groups.has(name)) {
    return name;
  }

  return name === 'settings' && isSecretsObject(node.object, aliases) ? name : null;
}

function findPropertyName(node) {
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }

  if (
    node.computed &&
    node.property.type === 'Literal' &&
    typeof node.property.value === 'string'
  ) {
    return node.property.value;
  }

  return null;
}

function isSecretsObject(object, aliases) {
  const inner = unwrap(object);

  if (inner.type === 'Identifier') {
    return aliases.has(inner.name);
  }

  const name = inner.type === 'MemberExpression' ? findPropertyName(inner) : null;

  return name !== null && aliases.has(name);
}

function unwrap(node) {
  const wrappers = [
    'TSAsExpression',
    'TSNonNullExpression',
    'TSSatisfiesExpression',
    'ChainExpression',
    'ParenthesizedExpression',
  ];

  return wrappers.includes(node.type) ? unwrap(node.expression) : node;
}

// A pattern that takes a property named like a secrets object, such as `{ secrets: held }`, makes
// the name it binds a secrets object too.
function collectPatternAliases(pattern, aliases) {
  for (const property of pattern.properties) {
    if (property.type !== 'Property') {
      continue;
    }

    const target =
      property.value.type === 'AssignmentPattern' ? property.value.left : property.value;

    if (target.type === 'ObjectPattern') {
      collectPatternAliases(target, aliases);
    } else if (target.type === 'Identifier' && aliases.has(findKeyName(property))) {
      aliases.add(target.name);
    }
  }
}

function findKeyName(property) {
  if (property.computed) {
    return null;
  }

  if (property.key.type === 'Identifier') {
    return property.key.name;
  }

  return property.key.type === 'Literal' && typeof property.key.value === 'string'
    ? property.key.value
    : null;
}

// A group's own name gives it away wherever it is read, so the pattern check for every pattern
// names the two groups. The settings group shares its name with other things, so it counts only
// when a pattern takes it from a secrets object.
function reportPattern(pattern, names, report) {
  for (const property of pattern.properties) {
    const name = property.type === 'Property' ? findKeyName(property) : null;

    if (name !== null && names.has(name)) {
      report(property, name);
    }
  }
}
