import type { Logger } from '@heynixie/logger';
import type { MailToolContext } from '@heynixie/mail';
import type { TasksContext } from '@heynixie/tasks';
import { buildMailPorts } from './build-mail-ports';
import type { ServerMail } from './create-server-mail';

// The context of the mail module's tools, connectors and source: the tasks context, with the
// logger that records the module's events. Null without a mailbox.
export function buildServerMailContext(
  mail: ServerMail | null,
  tasks: TasksContext,
  logEvent: Logger,
): MailToolContext | null {
  if (mail === null) {
    return null;
  }

  return {
    log: tasks.log,
    clock: tasks.clock,
    definitions: tasks.definitions,
    settings: mail.settings,
    logEvent,
    tasks,
    ports: buildMailPorts(tasks.log),
  };
}
