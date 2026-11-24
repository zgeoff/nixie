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

      return {
        MemberExpression(node) {
          const group = findGroup(node);

          if (group !== null) {
            report(node, group);
          }
        },
        ObjectPattern(node) {
          for (const property of node.properties) {
            const group = property.type === 'Property' ? findKeyName(property) : null;

            if (group !== null && isGroup(group)) {
              report(property, group);
            }
          }
        },
      };
    },
  };
}

function findGroup(node) {
  const name = findPropertyName(node);

  if (name === null) {
    return null;
  }

  if (groups.has(name)) {
    return name;
  }

  return name === 'settings' && isSecretsObject(node.object) ? name : null;
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

function isSecretsObject(object) {
  if (object.type === 'Identifier') {
    return secretsNames.has(object.name);
  }

  return object.type === 'MemberExpression' && findPropertyName(object) !== null
    ? secretsNames.has(findPropertyName(object))
    : false;
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

function isGroup(name) {
  return groups.has(name);
}
