import { join } from 'node:path';
import type { MailHost, MailSettings } from '@heynixie/mail';
import { buildMailSettings } from '@heynixie/mail';
import type { MemoryMailHost } from '@heynixie/mail/memory-host';
import { createFileMemoryMailHost } from '@heynixie/mail/memory-host';
import type { DeploymentConfig } from '../deployment/deployment-config-schema';

export interface ServerMailOptions {
  readonly config: Pick<DeploymentConfig, 'mail' | 'wake_rules' | 'web_fetch'>;
  readonly now: () => number;

  // the folder that the test build's host keeps its mail in, so a restart keeps it
  readonly dataDir: string;
}

export interface ServerMail {
  readonly host: MailHost;
  readonly settings: MailSettings;

  // the in-memory host that a test build serves, which a harness operation puts mail in
  readonly memory: MemoryMailHost | null;
}

// The assistant's own mailbox, or null when the config sets no `mail` section, which starts nixie
// with no mailbox. No real mail host is built yet, so only a test build serves one, in memory.
export function createServerMail(options: ServerMailOptions): ServerMail | null {
  const mail = options.config.mail;

  if (mail === undefined) {
    return null;
  }

  if (!NIXIE_TEST_BUILD) {
    throw new Error('the config sets a mail section, and no mail host is built yet');
  }

  const memory = createFileMemoryMailHost({
    address: mail.address,
    now: options.now,
    stateFile: join(options.dataDir, 'test-mail-host.json'),
  });

  return {
    host: memory,
    memory,
    settings: buildMailSettings(
      mail,
      options.config.wake_rules,
      options.config.web_fetch.linkPathChars,
    ),
  };
}
