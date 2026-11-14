import type { APIContext } from '../types';
import type { SeededIdentity } from './seed-identity';
import { seedIdentity } from './seed-identity';

export function createDeviceSession(
  context: APIContext,
  deviceName: string,
): Promise<SeededIdentity> {
  return seedIdentity(context, { deviceName });
}
