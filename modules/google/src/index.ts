export type { GoogleHosts, GoogleProvider } from './types';
export { buildGoogleConnector } from './connector/build-google-connector';
export { collectHeldBackTools, pickAvailableActions } from './actions/pick-available-actions';

// The types of the connections module that a provider fills, so an adapter of this feature depends
// on this module alone.
export type {
  ConnectorContext,
  HealthReport,
  MissingScope,
  OAuthSpec,
  SetupStep,
} from '@heynixie/connections';

export type { GmailAccess, GmailDeps, GoogleToolkit } from './gmail/types';
export { buildGmailActions } from './gmail/build-gmail-actions';
export { buildGoogleActions } from './actions/build-google-actions';
export { calendarCheckName, calendarToolNames } from './calendar/calendar-tool-names';
export { driveCheckName, driveToolNames } from './drive/drive-tool-names';
export { readGoogleBodyFields } from './actions/read-google-body-fields';
export { gmailCheckNames, gmailToolNames } from './gmail/gmail-tool-names';
export { gmailDeclarations } from './gmail/gmail-declarations';
export { readGmailBodyFields } from './gmail/read-gmail-body-fields';
export { readAttachmentContent, maxAttachmentBytes } from './call/read-attachment-content';
export type { AttachmentContent } from './call/read-attachment-content';
export type { GmailWakePort } from './gmail/types';
export type { GmailArrivalSourceInput, GmailConnection } from './gmail/poll/types';
export { buildGmailArrivalSource } from './gmail/poll/build-gmail-arrival-source';
export { collectGmailConnections } from './gmail/poll/collect-gmail-connections';
export { isGmailPolled } from './gmail/poll/is-gmail-polled';
export { gmailConfigSchema } from './gmail/gmail-config-schema';
export { readPickedFiles } from './drive/read-picked-files';
export type { PickedFile } from './drive/read-picked-files';
export { googleConfigSchema } from './connector/google-config-schema';
export { googleToolPrefixes } from './actions/google-tool-prefixes';
export { buildGmailMailbox, gmailSourceID } from './gmail/build-gmail-mailbox';
