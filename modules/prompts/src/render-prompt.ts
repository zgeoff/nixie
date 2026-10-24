import invariant from 'tiny-invariant';
import { fillTemplate } from './fill-template';
import { promptRegistry } from './prompt-registry';
import type { PromptContexts, PromptEntry, PromptID, PromptOverrides } from './types';

export function renderPrompt<ID extends PromptID>(
  id: ID,
  context: PromptContexts[ID],
  overrides: PromptOverrides,
): string {
  const entry: PromptEntry<PromptContexts[ID]> = promptRegistry[id];
  const override = overrides[id];
  const built = entry.buildValues(context);

  const values = new Map(entry.paths.map((path) => [path, getBuiltValue(built, path)]));

  for (const [name, part] of Object.entries(entry.parts)) {
    const isShown = part.isShown?.(context) ?? true;
    const text = isShown ? fillTemplate(override?.parts[name] ?? part.text, values) : '';

    values.set(`parts.${name}`, text);
  }

  return fillTemplate(override?.template ?? entry.template, values);
}

function getBuiltValue(built: Readonly<Record<string, string>>, path: string): string {
  const value = built[path];

  invariant(value !== undefined, `the prompt builds no value for its path "${path}"`);

  return value;
}
