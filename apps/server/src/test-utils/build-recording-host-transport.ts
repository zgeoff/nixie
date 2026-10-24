import { sendHostRequest } from '../send-host-request';
import type { HostTransport } from '../types';

export interface HostTransportRecord {
  readonly configPaths: readonly string[];
  readonly requests: readonly { readonly socketPath: string; readonly name: string }[];
}

export interface RecordingHostTransport {
  readonly transport: HostTransport;
  readonly record: HostTransportRecord;
}

export function buildRecordingHostTransport(socketPath: string): RecordingHostTransport {
  const configPaths: string[] = [];
  const requests: { socketPath: string; name: string }[] = [];

  return {
    transport: {
      resolveSocketPath: (configPath) => {
        configPaths.push(configPath);

        return Promise.resolve(socketPath);
      },
      sendHostRequest: (requestSocketPath, name, call) => {
        requests.push({ socketPath: requestSocketPath, name });

        return sendHostRequest(requestSocketPath, name, call);
      },
    },
    record: { configPaths, requests },
  };
}
