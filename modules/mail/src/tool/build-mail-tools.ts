import type { ToolDefinition } from '@heynixie/tools';
import type { MailHTMLReader, MailToolContext } from '../types';
import { buildMailListTool } from './build-mail-list-tool';
import { buildMailReadTool } from './build-mail-read-tool';
import { buildMailSaveAttachmentTool } from './build-mail-save-attachment-tool';
import { buildMailSendTool } from './build-mail-send-tool';
import { buildMailWakeCancelTool } from './build-mail-wake-cancel-tool';
import { buildMailWakeListTool } from './build-mail-wake-list-tool';
import { buildMailWakeSetTool } from './build-mail-wake-set-tool';

// The tools that a model calls on the assistant's own mailbox. The send and the reply are queued
// tools, which the connectors of the mail module run.
export function buildMailTools(context: MailToolContext, reader: MailHTMLReader): ToolDefinition[] {
  return [
    buildMailListTool(context),
    buildMailReadTool(context, reader),
    buildMailSaveAttachmentTool(context),
    buildMailSendTool(context, 'send'),
    buildMailSendTool(context, 'reply'),
    buildMailWakeSetTool(context),
    buildMailWakeListTool(context),
    buildMailWakeCancelTool(context),
  ];
}
