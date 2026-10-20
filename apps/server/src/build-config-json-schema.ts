import invariant from 'tiny-invariant';
import { z } from 'zod';
import { deploymentConfigSchema } from './deployment-config-schema';

// The keywords that one node of the JSON Schema gains, from the node that z.toJSONSchema emits
interface ReleaseRule {
  readonly path: readonly string[];
  readonly keywords: (node: Readonly<Record<string, unknown>>) => Record<string, unknown>;
}

// z.url checks the protocol of an http URL and that :// follows it, which format uri leaves out
const httpURLPattern = '^[Hh][Tt][Tt][Pp][Ss]?://';

// The rules on one key that the zod schemas check in code, which z.toJSONSchema drops. A release
// build refuses the test sandbox, so the imp adapter is the only one and needs its section.
const releaseRules: readonly ReleaseRule[] = [
  { path: ['properties', 'sandbox', 'properties', 'adapter'], keywords: () => ({ enum: ['imp'] }) },
  { path: [], keywords: (node) => ({ required: [...toStrings(node['required']), 'imp'] }) },
  {
    path: ['properties', 'models', 'properties', 'roles'],
    keywords: () => ({ required: ['conversation'] }),
  },
  {
    path: [
      'properties',
      'models',
      'properties',
      'profiles',
      'additionalProperties',
      'properties',
      'base_url',
    ],
    keywords: () => ({ pattern: httpURLPattern }),
  },
  {
    path: ['properties', 'imp', 'properties', 'url'],
    keywords: () => ({ pattern: httpURLPattern }),
  },

  // nixie takes any zone that Intl resolves, which adds aliases, offsets and any letter case to
  // these canonical names, so the schema can refuse a zone that nixie reads but never the reverse
  {
    path: ['properties', 'time', 'properties', 'default_zone'],
    keywords: () => ({ enum: Intl.supportedValuesOf('timeZone') }),
  },
];

// The deployment configuration as the JSON Schema that each release publishes. It holds the input
// that a release build of nixie reads, defaults included, and leaves out the rules that span keys,
// such as a role that points at a missing profile, which nixie refuses at start.
export function buildConfigJSONSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(deploymentConfigSchema, { io: 'input', target: 'draft-2020-12' });

  for (const rule of releaseRules) {
    const node = getSchemaNode(schema, rule.path);

    Object.assign(node, rule.keywords(node));
  }

  return {
    ...schema,
    title: 'nixie deployment configuration',
    description:
      'The config.yaml that nixie reads once at start, /etc/nixie/config.yaml by default',
  };
}

function toStrings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function getSchemaNode(schema: unknown, path: readonly string[]): Record<string, unknown> {
  let node = schema;

  for (const key of path) {
    invariant(isSchemaNode(node), `the config schema has no node at ${path.join('.')}`);

    node = node[key];
  }

  invariant(isSchemaNode(node), `the config schema has no node at ${path.join('.')}`);

  return node;
}

function isSchemaNode(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
