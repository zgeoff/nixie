import type { Definitions, JSONObject } from '@heynixie/log';
import type { CallDestination, PolicyCall } from '@heynixie/policy';
import type { StepPolicyFrame, ToolRun } from '../types';

const defaultFrame: StepPolicyFrame = {
  context: 'task',
  definitionID: null,
  turnMessageSequence: null,
  onBehalfOf: [],
  sources: [],
};

export interface ToolPolicyFacts {
  readonly tool: string;
  readonly input: JSONObject;
  readonly destinations: readonly CallDestination[];
  readonly definitions: Definitions;
  readonly at: number;
}

export function buildToolPolicyCall(run: ToolRun, facts: ToolPolicyFacts): PolicyCall {
  const frame = run.session?.policy ?? defaultFrame;

  return {
    tool: facts.tool,
    toolList: run.tools,
    context: frame.context,
    definitionID: frame.definitionID,
    args: facts.input,
    destinations: facts.destinations,
    sources: frame.sources,
    at: facts.at,
    turnMessageSequence: frame.turnMessageSequence,
    onBehalfOf: frame.onBehalfOf,
    snapshot: facts.definitions.snapshotHash,
  };
}
