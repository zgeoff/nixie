import { sessionHooks } from '@heynixie/api';
import {
  buildDeviceSessionHook,
  createDeviceStreams,
  reconcileDevices,
  startDeviceWakes,
  startWaitingShows,
} from '@heynixie/devices';
import { withWriteTransaction } from '@heynixie/log';
import { toErrorFields } from '@heynixie/logger';
import { conversationTaskID, writeThreadRecordInTransaction } from '@heynixie/tasks';
import type { AnyPartDeclaration } from '../types';
import type { ServerPartValues } from './server-part-values';

export const devicesPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    // The open streams of each device, which the API's device calls and the tools share, and the
    // device row that each session keeps. A start first brings the rows in step with the sessions
    // that changed while the feature was off.
    name: 'device_streams',
    feature: 'devices',
    needs: ['inputs', 'context'],
    start: async (reader) => {
      const inputs = reader.get('inputs');
      const apiContext = reader.get('context').apiContext;

      await withWriteTransaction(apiContext.log.writer, (tx) =>
        reconcileDevices(tx, apiContext.clock.now()),
      );

      const earlier = sessionHooks.list();

      sessionHooks.set([...earlier, buildDeviceSessionHook()]);

      await inputs.work.defer(() => {
        sessionHooks.set(earlier);
      });

      return createDeviceStreams({ clock: reader.get('context').apiContext.clock });
    },
  },
  {
    // A device that goes online or offline wakes the model when the list that devices.watch set
    // names the change.
    name: 'device_wakes',
    feature: 'devices',
    needs: ['server_parts', 'conversation_task', 'device_streams'],
    start: async (reader) => {
      const parts = reader.get('server_parts');
      const context = parts.apiContext;

      const stop = startDeviceWakes({
        log: context.log,
        definitions: context.definitions,
        streams: reader.get('device_streams'),
        thread: conversationTaskID,
        writeWake: (tx, input) => writeThreadRecordInTransaction(tx, context, input),
        onFailure: (error) => {
          parts.log('devices.wake_failed', toErrorFields(error), 'error');
        },
      });

      await parts.cleanup.defer(stop);
    },
  },
  {
    // A show that waited for its device counts its minutes from the time the device comes online.
    name: 'device_show_clocks',
    feature: 'devices',
    needs: ['server_parts', 'device_streams'],
    start: async (reader) => {
      const parts = reader.get('server_parts');
      const context = parts.apiContext;

      const stop = startWaitingShows({
        log: context.log,
        definitions: context.definitions,
        clock: context.clock,
        streams: reader.get('device_streams'),
        onFailure: (error) => {
          parts.log('devices.show_clock_failed', toErrorFields(error), 'error');
        },
      });

      await parts.cleanup.defer(stop);
    },
  },
];
