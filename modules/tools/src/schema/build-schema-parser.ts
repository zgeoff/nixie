import { addFormats } from '@modelcontextprotocol/server/validators/ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import type { JsonSchema, SchemaCheck } from '../types';

const compiler: { ajv: Ajv2020 | null } = { ajv: null };

// Ajv compiles each schema to code, and a start registers every tool while a turn calls few, so
// each schema compiles on its first parse. A schema that cannot compile throws on that parse.
export function buildSchemaParser(schema: JsonSchema): (value: unknown) => SchemaCheck {
  const parser: { validate: ValidateFunction | null } = { validate: null };
  const names = collectSchemaNames(schema);

  return (value) => {
    compiler.ajv ??= buildAjv();
    parser.validate ??= compiler.ajv.compile(schema);

    return parser.validate(value)
      ? { isValid: true }
      : { isValid: false, errors: buildErrorText(parser.validate.errors ?? [], names) };
  };
}

function collectSchemaNames(schema: unknown): ReadonlySet<string> {
  const names = new Set<string>();

  collectNames(schema, names);

  return names;
}

function collectNames(node: unknown, names: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectNames(item, names);
    }

    return;
  }

  if (typeof node !== 'object' || node === null) {
    return;
  }

  for (const [key, child] of Object.entries(node)) {
    if (key === 'properties' && typeof child === 'object' && child !== null) {
      for (const name of Object.keys(child)) {
        names.add(name);
      }
    }

    collectNames(child, names);
  }
}

function buildAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    strict: false,
    validateFormats: true,
    validateSchema: false,
    allErrors: true,
  });

  addFormats(ajv);

  return ajv;
}

// A path can hold a key that the call sent, so a name that the schema declares and an array index
// stay in it and any other key reads as *. A rejected key name has its own message, which the text
// replaces.
function buildErrorText(errors: readonly ErrorObject[], names: ReadonlySet<string>): string {
  return errors
    .map((error) => {
      const segments = error.instancePath
        .split('/')
        .filter((segment) => segment !== '')
        .map((segment) => decodePointerSegment(segment))
        .map((segment) => (/^\d+$/u.test(segment) || names.has(segment) ? segment : '*'));

      const path = segments.length === 0 ? 'data' : `data/${segments.join('/')}`;

      return `${path} ${error.keyword === 'propertyNames' ? 'has a key name that is invalid' : (error.message ?? 'is invalid')}`;
    })
    .join(', ');
}

function decodePointerSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}
