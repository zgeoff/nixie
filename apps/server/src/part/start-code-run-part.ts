import type { CodeRunCleanup } from '@heynixie/connectors';
import { buildCodeRunTool, buildFileSendTool, makeCodeRunCleanup } from '@heynixie/connectors';
import type { DefinitionsInForce } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import { buildNoteBodies } from '@heynixie/notebook';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { ToolDefinition } from '@heynixie/tools';
import { readConversationSkills } from '../conversation/read-conversation-skills';
import { getSandboxImage } from '../sandbox/get-sandbox-image';
import type { ServerPartsOptions } from '../server/start-server';

export interface CodeRunPartInputs {
  readonly options: Pick<ServerPartsOptions, 'images' | 'config' | 'harness' | 'log'>;
  readonly adapter: SandboxAdapter;
  readonly log: Log;
  readonly readInForce: () => DefinitionsInForce | null;
}

export interface CodeRunPart {
  readonly tool: ToolDefinition;
  readonly sendTool: ToolDefinition;
  readonly cleanup: CodeRunCleanup;
}

export function startCodeRunPart(inputs: CodeRunPartInputs): Promise<CodeRunPart> {
  const clock =
    inputs.options.harness === undefined
      ? inputs.log.writer.clock
      : inputs.options.harness.link.clock;

  return Promise.resolve({
    tool: buildCodeRunTool({
      log: inputs.log,
      adapter: inputs.adapter,
      clock,
      logger: inputs.options.log,
      image: getSandboxImage(inputs.options.images, 'code').name,
      imageLongEdge: inputs.options.config.web_fetch.imageLongEdge,
      notes: buildNoteBodies(inputs.log),
      readSkills: (run, names) =>
        readConversationSkills(inputs.log, inputs.readInForce(), run, names),
    }),
    sendTool: buildFileSendTool({ log: inputs.log }),
    cleanup: makeCodeRunCleanup(inputs.log, inputs.adapter),
  });
}
