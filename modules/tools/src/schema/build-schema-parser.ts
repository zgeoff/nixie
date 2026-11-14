import type { JsonSchemaValidator } from '@modelcontextprotocol/server';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import type { JsonSchema, SchemaCheck } from '../types';

const compiler: { validator: AjvJsonSchemaValidator | null } = { validator: null };

// Ajv compiles each schema to code, and a start registers every tool while a turn calls few, so
// each schema compiles on its first parse. A schema that cannot compile throws on that parse.
export function buildSchemaParser(schema: JsonSchema): (value: unknown) => SchemaCheck {
  const parser: { validate: JsonSchemaValidator<unknown> | null } = { validate: null };
  const names = collectSchemaNames(schema);

  return (value) => {
    compiler.validator ??= new AjvJsonSchemaValidator();

    parser.validate ??= compiler.validator.getValidator(schema);

    const result = parser.validate(value);

    return result.valid
      ? { isValid: true }
      : { isValid: false, errors: redactErrors(result.errorMessage, names) };
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

// The validator prints the path of each fault, and a path can hold a key that the call sent when the
// schema accepts extra keys. A name that the schema itself declares, or an array index, stays.
function redactErrors(errors: string, names: ReadonlySet<string>): string {
  return errors.replaceAll(/data(?<path>(?:\/[^\s,]*)?)/gu, (_match, path: string) => {
    const segments = path
      .split('/')
      .filter((segment) => segment !== '')
      .map((segment) => (/^\d+$/u.test(segment) || names.has(segment) ? segment : '*'));

    return segments.length === 0 ? 'data' : `data/${segments.join('/')}`;
  });
}
