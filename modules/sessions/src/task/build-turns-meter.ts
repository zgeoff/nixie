import { modelTurnEndedCodec } from '@heynixie/models';
import type { RunMeter } from '@heynixie/tasks';
import { readRunRecords } from '@heynixie/tasks';

export function buildTurnsMeter(): RunMeter {
  return {
    name: 'turns',
    read: async (context, run) => {
      const turns = await readRunRecords(context, run, [modelTurnEndedCodec.kind]);

      return turns.length;
    },
    render: (limit) => `${String(limit)} turns`,
  };
}
