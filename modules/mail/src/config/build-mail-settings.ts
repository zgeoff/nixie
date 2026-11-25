import type { WakeRulesConfig } from '@heynixie/triggers';
import type { MailSettings } from '../types';
import type { MailConfig } from './mail-config-schema';

export function buildMailSettings(config: MailConfig, wake: WakeRulesConfig): MailSettings {
  return {
    address: config.address,
    hostPollIntervalMs: config.host_poll_interval,
    wake,
  };
}
