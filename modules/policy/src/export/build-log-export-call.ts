import type { EffectDeclaration, PolicyCall } from '../types';

export const logExportToolName = 'log.export';

// The export reads every record of the log in clear text, so it declares the one effect that names
// that, and it holds no destination, amount or free text for a rule to check.
export const logExportDeclaration: EffectDeclaration = {
  effects: ['export'],
  destinations: [],
  amount: null,
  content: [],
  results: {},
};

export function findLogExportDeclaration(tool: string): EffectDeclaration | null {
  return tool === logExportToolName ? logExportDeclaration : null;
}

export interface LogExportCallOptions {
  readonly path: string;
  readonly snapshot: string;
  readonly at: number;
}

// A host command is the user's own request, so the call comes from the user in a conversation
// context, on a tool list that holds the export alone.
export function buildLogExportCall(options: LogExportCallOptions): PolicyCall {
  return {
    tool: logExportToolName,
    toolList: [logExportToolName],
    context: 'conversation',
    definitionID: null,
    args: { path: options.path },
    destinations: [],
    sources: ['owner'],
    at: options.at,
    turnMessageSequence: null,
    onBehalfOf: [],
    snapshot: options.snapshot,
  };
}
