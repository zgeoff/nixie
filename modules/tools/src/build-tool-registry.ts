import type { EffectDeclaration } from '@heynixie/policy';
import { hasQueuedEffect } from '@heynixie/policy';
import { buildSchemaParser } from './schema/build-schema-parser';
import type { RegisteredTool, ToolDefinition, ToolRegistry } from './types';

export function buildToolRegistry(definitions: readonly ToolDefinition[]): ToolRegistry {
  const tools = new Map<string, RegisteredTool>();

  for (const definition of definitions) {
    if (tools.has(definition.name)) {
      throw new Error(`the tool ${definition.name} is defined twice`);
    }

    assertDefinition(definition);

    tools.set(definition.name, {
      definition,
      parseInput: buildSchemaParser(definition.input),
      parseOutput: buildSchemaParser(definition.output),
    });
  }

  return { findTool: (name) => tools.get(name) ?? null };
}

function assertDefinition(definition: ToolDefinition): void {
  if (definition.input['type'] !== 'object') {
    throw new Error(`the tool ${definition.name} needs an object input schema`);
  }

  assertDeclaration(definition, definition.declaration, definition.name);

  for (const [variant, declaration] of Object.entries(definition.variants?.declarations ?? {})) {
    assertDeclaration(definition, declaration, `${definition.name}/${variant}`);
  }
}

function assertDeclaration(
  definition: ToolDefinition,
  declaration: EffectDeclaration,
  name: string,
): void {
  assertExecution(definition, declaration, name);
  assertResultSources(definition, declaration, name);
}

function assertExecution(
  definition: ToolDefinition,
  declaration: EffectDeclaration,
  name: string,
): void {
  const execution = hasQueuedEffect(declaration.effects) ? 'queued' : 'direct';

  if (definition.execution !== execution) {
    throw new Error(
      `the tool ${name} runs ${definition.execution}, but its effects make it ${execution}`,
    );
  }
}

function assertResultSources(
  definition: ToolDefinition,
  declaration: EffectDeclaration,
  name: string,
): void {
  const properties = definition.output['properties'];

  const fields =
    typeof properties === 'object' && properties !== null && !Array.isArray(properties)
      ? Object.keys(properties)
      : [];

  const sources = Object.keys(declaration.results);
  const unsourced = fields.filter((field) => !sources.includes(field));
  const unknown = sources.filter((field) => !fields.includes(field));

  if (definition.output['type'] !== 'object' || unsourced.length > 0 || unknown.length > 0) {
    throw new Error(
      `the tool ${name} needs an object result whose every field has a source: ` +
        `unsourced [${unsourced.join(', ')}], unknown [${unknown.join(', ')}]`,
    );
  }
}
