import type { ContractClient, ContractInputs, DeviceEvent } from '@heynixie/contract';

type DeviceForm = Extract<ContractInputs['live']['follow'], { device: unknown }>;

interface DeviceEvents {
  readonly next: () => Promise<IteratorResult<DeviceEvent, undefined>>;
  readonly return: () => Promise<IteratorResult<DeviceEvent, undefined>>;
}

interface DeviceFollowInput {
  readonly pixels: DeviceForm['device']['pixels'];
}

interface DeviceFollowOptions {
  readonly signal?: AbortSignal;
}

// Opens the device form of the live stream, and hands back its device events with the opened event
// left out.
export async function followTestDevice(
  client: ContractClient,
  input: DeviceFollowInput,
  options?: DeviceFollowOptions,
): Promise<DeviceEvents> {
  const stream = await client.live.follow({ device: input }, options);

  const next = async (): Promise<IteratorResult<DeviceEvent, undefined>> => {
    const result = await stream.next();

    if (result.done === true) {
      return { done: true, value: undefined };
    }

    return result.value.kind === 'device' ? { done: false, value: result.value.event } : next();
  };

  return {
    next,
    return: async () => {
      await stream.return(undefined);

      return { done: true, value: undefined };
    },
  };
}
