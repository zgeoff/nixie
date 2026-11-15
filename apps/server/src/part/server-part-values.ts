import type { CleanupRecordSessions } from '@heynixie/api';
import type { DefinitionsExportSweep, SeedResult } from '@heynixie/definitions';
import type { StartedMemoryStore } from '@heynixie/memory';
import type { CheckerTask, NixieRunner } from '@heynixie/sessions';
import type { TurnInputs } from '@heynixie/turn-inputs';
import type { ConversationImp } from '../conversation/start-conversation-imp';
import type { ServerResetControl } from '../server/build-server-reset';
import type { ServerParts } from '../types';
import type { APIGate } from '../utils/build-api-gate';
import type { DecisionPointFactory } from '../utils/make-server-decisions';
import type { ServerInputs } from './server-inputs';
import type { CodeRunPart } from './start-code-run-part';
import type { Tools } from './tools';

export interface ServerPartValues {
  readonly inputs: ServerInputs;
  readonly state: ServerParts['state'];
  readonly context: Pick<ServerParts, 'apiContext' | 'inForce'>;
  readonly decisions: DecisionPointFactory;
  readonly sandbox_adapter: Tools['adapter'];
  readonly web_fetch: Tools['webFetch'];
  readonly code_run: CodeRunPart;
  readonly actions: Tools['actions'];
  readonly tool_endpoint: Pick<Tools, 'definitions' | 'endpoint'>;
  readonly tools: Tools;
  readonly api_gate: APIGate;
  readonly http: number;
  readonly turn_inputs: TurnInputs;
  readonly server_parts: ServerParts;
  readonly reset: ServerResetControl;
  readonly host_commands: void;
  readonly first_seed: void;
  readonly restore_pause: void;
  readonly recovery: void;
  readonly add_images: void;
  readonly conversation_imp: ConversationImp;
  readonly checker: CheckerTask;
  readonly memory: StartedMemoryStore;

  readonly session_cleanup: CleanupRecordSessions;
  readonly record_forgets: void;
  readonly memory_consolidator: ConversationImp['runStep'];
  readonly definitions_seed: SeedResult;
  readonly start_record: void;
  readonly conversation_task: void;
  readonly nixie_runner: NixieRunner;
  readonly runners: void;
  readonly seed_poll: void;
  readonly proposal_sweeps: void;
  readonly prompt_lapse_sweep: void;
  readonly backups: void;

  readonly definitions_exports: DefinitionsExportSweep | null;
  readonly ready: void;
}
