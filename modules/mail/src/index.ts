export type {
  HostChanges,
  HostCursor,
  HostMail,
  MailContext,
  MailHost,
  MailSettings,
  MailToolContext,
  OutgoingMail,
  ParsedMail,
} from './types';

export type { MailRecordKind } from './record/mail-record-kind';
export { mailRecordTopics } from './record/mail-record-topics';
export { mailMessagesProjection } from './store/mail-messages-projection';
export type { MailConfig } from './config/mail-config-schema';
export { mailConfigSchema } from './config/mail-config-schema';
export { buildMailSettings } from './config/build-mail-settings';
export { buildMailSource } from './source/build-mail-source';
export { buildMailConnectors } from './connector/build-mail-connectors';
export { mailToolNames } from './connector/mail-tool-names';
export { buildMailTools } from './tool/build-mail-tools';
export { parseMail } from './parse/parse-mail';
