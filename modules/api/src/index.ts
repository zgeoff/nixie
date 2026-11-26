export { apiProjections } from './api/api-projections';
export { apiConfigSchema } from './session/api-config-schema';
export { createAPIApp } from './api/create-api-app';
export { createWatchRoute } from './computer/create-watch-route';
export type { WatchRoute, WatchSocketData } from './computer/create-watch-route';
export { createWatchTickets } from './computer/create-watch-tickets';
export { createEnrolmentCode } from './enrolment/create-enrolment-code';
export { createFirstEnrolmentCode } from './enrolment/create-first-enrolment-code';
export { createPasskeyState } from './passkey/passkey-state';
export { defaultAPISettings, defaultPolicySettings } from './utils/default-api-settings';
export { makeHostResponder } from './host/make-host-responder';
export { readForgetBackupState } from './forget/read-forget-backup-state';
export type { KeptSession } from './kept/read-kept-sessions';
export { readKeptSessions } from './kept/read-kept-sessions';
export { readSessions } from './utils/read-sessions';
export { readAllPasskeys } from './passkey/read-all-passkeys';
export { removeRevokedPasskeys } from './passkey/remove-revoked-passkeys';
export { forgetToolName } from './proposal/read-forget-body-fields';
export { readRecordForget } from './utils/read-record-forget';
export { readRecordForgetCheck } from './record/read-record-forget-check';
export { readRecordForgetProgress } from './record/read-record-forget-progress';
export { runRecordForget } from './record/run-record-forget';
export { runActionProposalAnswer } from './proposal/run-action-proposal-answer';
export { runMcpProposalAnswer } from './proposal/run-mcp-proposal-answer';
export { runPendingRecordForgets } from './record/run-pending-record-forgets';
export { updateSessionLabel } from './session/update-session-label';
export { writeKeptSessions } from './kept/write-kept-sessions';

export type {
  APIContext,
  APITables,
  APISettings,
  CleanupRecordSessions,
  ComputerWatchPort,
  ErasureStuckPort,
  ForgetBackupState,
  HostBackups,
  HostRouterOptions,
  Identity,
  ReadViewMemory,
  StuckForget,
} from './types';

export type { APIRecordKind } from './api/api-record-kind';
export type { ProposalParts } from './proposal/build-proposal-core-deps';
export { buildProposalCoreDeps } from './proposal/build-proposal-core-deps';
export { proposalsProjection } from './proposal/proposals-projection';
export { conversationErasableDescriptor } from './erasable/conversation-erasable-descriptor';
export { imageErasableDescriptor } from './erasable/image-erasable-descriptor';
export { recordErasableDescriptor } from './erasable/record-erasable-descriptor';
export { apiRecordTopics } from './api/api-record-topics';
export { collectModuleRecordTopicMaps } from './live/collect-module-record-topic-maps';
export type { ClientRegistry, Presence } from './live/create-client-registry';
export { createClientRegistry } from './live/create-client-registry';
export { buildMailFileReader } from './proposal/build-mail-file-reader';
