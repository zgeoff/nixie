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

// Builds nixie's tool registry and refuses a definition that breaks a registry rule: a repeated
// name, an input that is not an object, an execution that does not follow from the effects, or a
// result field with no source.
export function buildToolRegistry(definitions: readonly ToolDefinition[]): ToolRegistry {
  const validator = new AjvJsonSchemaValidator();
  const makeSchemaParser = (schema: JsonSchema) => toSchemaParser(validator.getValidator(schema));
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

function assertDefinition(definition: ToolDefinition): void {
  if (definition.input['type'] !== 'object') {
    throw new Error(`the tool ${definition.name} needs an object input schema`);
  }
  assertExecution(definition);
  assertResultSources(definition);
}

// A tool with any of these effects acts outside nixie, so it runs as an action. A read retried
// after a crash repeats nothing, so every other tool runs direct.
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

// Every top-level field of the typed result declares its source of content, and every declared
// source names a field, so each result field's record carries its source.
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

function toSchemaParser(validate: JsonSchemaValidator<unknown>): (value: unknown) => SchemaCheck {
  return (value) => {
    const result = validate(value);

    return result.valid ? { isValid: true } : { isValid: false, errors: result.errorMessage };
  };
}
