import type { RunMeter, RunSettings } from '../run/types';

export interface TestRunSettingsOptions {
  // what each meter reads for any task run
  readonly used?: { readonly turns: number; readonly dollars: number };
  readonly hopLimit?: number;
  readonly meter?: 'gateway' | 'records';
}

export function buildTestRunSettings(options: TestRunSettingsOptions = {}): RunSettings {
  const used = options.used ?? { turns: 0, dollars: 0 };

  const turns: RunMeter = {
    name: 'turns',
    read: () => Promise.resolve(used.turns),
    render: (limit) => `${String(limit)} turns`,
  };

  const dollars: RunMeter = {
    name: 'dollars',
    read: () => Promise.resolve(used.dollars),
    render: (limit) => `$${limit.toFixed(2)}`,
  };

  return {
    reportDefaults: { start: 'wake', definition: 'next_turn' },
    meter: options.meter ?? 'records',
    meters: [turns, dollars],
    hopLimit: options.hopLimit ?? 6,
  };
}
