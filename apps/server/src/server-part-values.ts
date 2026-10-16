import type { CleanupRecordSessions } from '@heynixie/api';
import type { SeedResult } from '@heynixie/definitions';
import type { StartedMemoryStore } from '@heynixie/memory';
import type { APIGate } from './build-api-gate';
import type { ServerResetControl } from './build-server-reset';
import type { ServerInputs } from './server-inputs';
import type { ConversationImp } from './start-conversation-imp';
import type { Tools } from './tools';
import type { ServerParts } from './types';

// The value of each part of the server's start, by the part's name.
export interface ServerPartValues {
  readonly inputs: ServerInputs;
  readonly state: ServerParts['state'];
  readonly context: Pick<ServerParts, 'apiContext' | 'inForce'>;
  readonly sandbox_adapter: Tools['adapter'];
  readonly web_fetch: Tools['webFetch'];
  readonly actions: Tools['actions'];
  readonly tool_endpoint: Pick<Tools, 'definitions' | 'endpoint'>;
  readonly tools: Tools;
  readonly api_gate: APIGate;
  readonly http: number;
  readonly server_parts: ServerParts;
  readonly reset: ServerResetControl;
  readonly host_commands: void;
  readonly first_seed: void;
  readonly recovery: void;
  readonly add_images: void;
  readonly conversation_imp: ConversationImp;
  readonly memory: StartedMemoryStore;

  // the conversation's session cleanup, which a record forget runs once the memory store started
  readonly session_cleanup: CleanupRecordSessions;
  readonly record_forgets: void;
  readonly memory_writer: ConversationImp['runStep'];
  readonly memory_consolidator: ConversationImp['runStep'];
  readonly definitions_seed: SeedResult;
  readonly start_record: void;
  readonly conversation_task: void;
  readonly runners: void;
  readonly seed_poll: void;
  readonly ready: void;
}
