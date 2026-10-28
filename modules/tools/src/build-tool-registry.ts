import type { Effect } from '@heynixie/policy';
import type { JsonSchemaValidator } from '@modelcontextprotocol/server';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import type {
  JsonSchema,
  RegisteredTool,
  SchemaCheck,
  ToolDefinition,
  ToolRegistry,
} from './types';

export function buildToolRegistry(definitions: readonly ToolDefinition[]): ToolRegistry {
  const compiler: { validator: AjvJsonSchemaValidator | null } = { validator: null };

  // Ajv compiles each schema to code, and a start registers every tool while a turn calls few, so
  // each schema compiles on its first parse.
  const makeSchemaParser = (schema: JsonSchema) => {
    const parser: { validate: JsonSchemaValidator<unknown> | null } = { validate: null };

    return (value: unknown): SchemaCheck => {
      compiler.validator ??= new AjvJsonSchemaValidator();

      parser.validate ??= compiler.validator.getValidator(schema);

      return toSchemaCheck(parser.validate(value));
    };
  };

  const tools = new Map<string, RegisteredTool>();

  for (const definition of definitions) {
    if (tools.has(definition.name)) {
      throw new Error(`the tool ${definition.name} is defined twice`);
    }

    assertDefinition(definition);

    tools.set(definition.name, {
      definition,
      parseInput: makeSchemaParser(definition.input),
      parseOutput: makeSchemaParser(definition.output),
    });
  }

  return { findTool: (name) => tools.get(name) ?? null };
}

function toSchemaCheck(result: ReturnType<JsonSchemaValidator<unknown>>): SchemaCheck {
  return result.valid ? { isValid: true } : { isValid: false, errors: result.errorMessage };
}

function assertDefinition(definition: ToolDefinition): void {
  if (definition.input['type'] !== 'object') {
    throw new Error(`the tool ${definition.name} needs an object input schema`);
  }

  assertExecution(definition);
  assertResultSources(definition);
}

const queuedEffects: ReadonlySet<Effect> = new Set(['write', 'delete', 'send', 'spend', 'device']);

function assertExecution(definition: ToolDefinition): void {
  const execution = definition.declaration.effects.some((effect) => queuedEffects.has(effect))
    ? 'queued'
    : 'direct';

  if (definition.execution !== execution) {
    throw new Error(
      `the tool ${definition.name} runs ${definition.execution}, but its effects make it ${execution}`,
    );
  }
}

function assertResultSources(definition: ToolDefinition): void {
  const properties = definition.output['properties'];

  const fields =
    typeof properties === 'object' && properties !== null && !Array.isArray(properties)
      ? Object.keys(properties)
      : [];

  const sources = Object.keys(definition.declaration.results);
  const unsourced = fields.filter((field) => !sources.includes(field));
  const unknown = sources.filter((field) => !fields.includes(field));

  if (definition.output['type'] !== 'object' || unsourced.length > 0 || unknown.length > 0) {
    throw new Error(
      `the tool ${definition.name} needs an object result whose every field has a source: ` +
        `unsourced [${unsourced.join(', ')}], unknown [${unknown.join(', ')}]`,
    );
  }
}
