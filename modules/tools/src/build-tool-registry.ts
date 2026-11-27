import type { EffectDeclaration } from '@heynixie/policy';
import { hasQueuedEffect } from '@heynixie/policy';
import { buildSchemaParser } from './schema/build-schema-parser';
import type { RegisteredTool, ToolDefinition, ToolRegistry, ToolSource } from './types';

// The registry of nixie's own tools and of each source's tools. nixie's own tool wins a name clash,
// and a source's names are read again each time the registry's names are.
export function buildToolRegistry(
  definitions: readonly ToolDefinition[],
  sources: readonly ToolSource[] = [],
): ToolRegistry {
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

  return {
    get toolNames() {
      const own = [...tools.keys()];

      const known = new Set(own);

      return [
        ...own,
        ...sources.flatMap((source) => source.toolNames()).filter((name) => !known.has(name)),
      ];
    },
    findTool: (name) => tools.get(name) ?? findInSources(sources, name),
    prepareTaskRun: async (names) => {
      await Promise.all(
        sources.map((source) => source.prepareTaskRun?.(names) ?? Promise.resolve()),
      );
    },
  };
}

function assertDefinition(definition: ToolDefinition): void {
  if (definition.input['type'] !== 'object') {
    throw new Error(`the tool ${definition.name} needs an object input schema`);
  }

  assertDeclaration(definition, definition.declaration, definition.name);
  assertPaid(definition);

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

  // a queued tool whose prepare step adds the queued effect, such as a click that sends only unless
  // it follows a plain link, declares the reading effects alone
  const isPreparedQueue = definition.execution === 'queued' && definition.prepare !== undefined;

  if (definition.execution !== execution && !isPreparedQueue) {
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

function assertPaid(definition: ToolDefinition): void {
  if (definition.paid === undefined) {
    return;
  }

  const price = definition.paid.priceMicros;

  if (typeof price === 'number' && !isPriceMicros(price)) {
    throw new Error(`the paid tool ${definition.name} needs a price in whole micros above zero`);
  }

  if (definition.execution !== 'direct') {
    throw new Error(`the paid tool ${definition.name} runs direct, and a queued tool is not paid`);
  }
}

function findInSources(sources: readonly ToolSource[], name: string): RegisteredTool | null {
  for (const source of sources) {
    const found = source.findTool(name);

    if (found !== null) {
      return found;
    }
  }

  return null;
}

export function isPriceMicros(price: number): boolean {
  return Number.isInteger(price) && price > 0;
}
