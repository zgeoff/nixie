import type { TurnInputLogConfig } from '../turn-input-log-config-schema';

export interface InputLogSetting {
  readonly state: 'on' | 'off';
  readonly until: number | null;
}

// The latest set record decides, and with none, the config's default. With no section the log is
// always off.
export function pickInputLogState(
  config: TurnInputLogConfig | null,
  latest: InputLogSetting | null,
  now: number,
): InputLogSetting {
  if (config === null) {
    return { state: 'off', until: null };
  }

  if (latest === null) {
    return { state: config.default === 'always' ? 'on' : 'off', until: null };
  }

  const isOn = latest.state === 'on' && (latest.until === null || now < latest.until);

  return { state: isOn ? 'on' : 'off', until: latest.until };
}
