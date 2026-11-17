import type { RegisteredTool, ToolCall } from '../types';

export type VariantPick =
  | { readonly status: 'picked'; readonly registered: RegisteredTool; readonly policyTool: string }
  | { readonly status: 'error'; readonly message: string }
  | null;

// A tool with variants runs as the variant that its input picks, under that variant's declaration.
export function pickVariant(registered: RegisteredTool, call: ToolCall): VariantPick {
  const variants = registered.definition.variants;

  if (variants === undefined) {
    return null;
  }

  const name = variants.pick(call.input);
  const declaration = variants.declarations[name];

  if (declaration === undefined) {
    return { status: 'error', message: `the tool ${call.tool} has no variant ${name}` };
  }

  return {
    status: 'picked',
    registered: { ...registered, definition: { ...registered.definition, declaration } },
    policyTool: `${call.tool}/${name}`,
  };
}
