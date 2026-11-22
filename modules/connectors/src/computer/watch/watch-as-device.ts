import type { Takeover } from '../takeover/types';
import { openComputerWatch } from './open-computer-watch';
import type { WatchHost } from './open-computer-watch';
import type { WatchConnection, WatchSocket } from './types';

// A watch of the device: its key and pointer messages pass while the device holds the desktop, each
// one holds off the idle hand-back, and the end of the hold drops what the watch still holds.
export function watchAsDevice(
  host: WatchHost,
  takeover: Takeover,
  socket: WatchSocket,
  deviceID: string,
): WatchConnection {
  const connection = openComputerWatch(host, socket, {
    canInput: () => takeover.isHolder(deviceID),
    onInput: () => {
      takeover.touch(deviceID);
    },
  });

  const remove = takeover.addWatch(deviceID, connection);

  return {
    ...connection,
    end: () => {
      remove();

      connection.end();
    },
  };
}
