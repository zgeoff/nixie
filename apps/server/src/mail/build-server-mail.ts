import type { Logger } from '@heynixie/logger';
import type { MailHost, MailSettings, MailToolContext } from '@heynixie/mail';
import { buildMailSettings } from '@heynixie/mail';
import type { MemoryMailHost } from '@heynixie/mail/memory-host';
import { buildMemoryMailHost } from '@heynixie/mail/memory-host';
import type { TasksContext } from '@heynixie/tasks';
import type { DeploymentConfig } from '../deployment/deployment-config-schema';

export interface ServerMailOptions {
  readonly config: Pick<DeploymentConfig, 'mail' | 'wake_rules'>;
  readonly now: () => number;
}

export interface ServerMail {
  readonly host: MailHost;
  readonly settings: MailSettings;

  // the in-memory host that a test build serves, which a harness operation puts mail in
  readonly memory: MemoryMailHost | null;
}

// The assistant's own mailbox, or null when the config sets no `mail` section, which starts nixie
// with no mailbox. No real mail host is built yet, so only a test build serves one, in memory.
export function buildServerMail(options: ServerMailOptions): ServerMail | null {
  const mail = options.config.mail;

  if (mail === undefined) {
    return null;
  }

  if (!NIXIE_TEST_BUILD) {
    throw new Error('the config sets a mail section, and no mail host is built yet');
  }

  const memory = buildMemoryMailHost({ address: mail.address, now: options.now });

  return {
    host: memory,
    memory,
    settings: buildMailSettings(mail, options.config.wake_rules),
  };
}

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
  };
}
