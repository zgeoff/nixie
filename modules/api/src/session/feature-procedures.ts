import type { DeviceEvent } from '@heynixie/contract';
import type { APIContext } from '../types';
import type { createCallsOffProcedures } from './create-calls-off-procedures';
import type { createDevicesOffProcedures } from './create-devices-off-procedures';

type CallsProcedures = ReturnType<typeof createCallsOffProcedures>;

type DevicesProcedures = ReturnType<typeof createDevicesOffProcedures>;

interface DeviceStreamRequest {
  readonly sessionToken: string | undefined;
  readonly pixels: {
    readonly width: number;
    readonly height: number;
    readonly pixelRatio: number;
    readonly timeZone?: string;
  };
  readonly signal: AbortSignal | undefined;

  // the refusals of a session that holds no device row
  readonly buildUnauthorized: () => Error;
  readonly buildNotADevice: () => Error;
}

export type DeviceStreamEvent =
  | { readonly kind: 'opened' }
  | { readonly kind: 'device'; readonly event: DeviceEvent };

// The procedures and routes that a feature supplies when it is on. The router mounts the answers of
// a feature that is off in place of one that is missing.
export interface FeatureProcedures {
  readonly calls?: (context: APIContext) => CallsProcedures;
  readonly devices?: (context: APIContext) => DevicesProcedures;

  // Answers a request for a device page's frame or file, or null for any other path.
  readonly devicePages?: (context: APIContext, request: Request) => Promise<Response> | null;

  // Opens the device form of the live stream.
  readonly deviceStream?: (
    context: APIContext,
    request: DeviceStreamRequest,
  ) => Promise<AsyncGenerator<DeviceStreamEvent, void, undefined>>;
}
