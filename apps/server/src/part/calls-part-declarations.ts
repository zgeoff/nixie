import { sessionHooks } from '@heynixie/api';
import { buildCallSessionHook, startCallSweep } from '@heynixie/calls';
import type { AnyPartDeclaration } from '../types';
import type { ServerPartValues } from './server-part-values';
import { startCallsPart } from './start-calls-part';

export const callsPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    // The calls module: the speech layer, the call tasks' context and the hang-up on sign-out.
    name: 'calls',
    feature: 'voice',
    needs: ['inputs', 'context'],
    start: async (reader) => {
      const inputs = reader.get('inputs');
      const calls = startCallsPart(inputs, reader.get('context'));
      const earlier = sessionHooks.list();

      sessionHooks.set([...earlier, buildCallSessionHook(calls.context)]);

      await inputs.work.defer(() => {
        sessionHooks.set(earlier);
      });

      return calls;
    },
  },
  {
    // Charges each started minute of a live call, and ends a call that never connects or lost its
    // speech session.
    name: 'calls_sweep',
    feature: 'voice',
    needs: ['server_parts', 'runners', 'calls'],
    start: async (reader) => {
      const sweep = startCallSweep(reader.get('calls').context);

      await reader.get('server_parts').cleanup.defer(() => sweep.stop());
    },
  },
];
