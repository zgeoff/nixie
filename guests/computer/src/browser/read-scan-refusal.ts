import type { ComputerReply } from '@heynixie/wire';
import type { ScanGate } from './types';

// The refusal for an address that the scan channel refuses, or null for one it passes. A caller
// asks it before it resolves the address's host, so a secret in the host never reaches a resolver.
export async function readScanRefusal(
  address: string,
  gate: Pick<ScanGate, 'scan'>,
): Promise<ComputerReply | null> {
  try {
    await gate.scan(address);

    return null;
  } catch (error) {
    return {
      kind: 'failed',
      ok: false,
      reason: 'failed',
      message: error instanceof Error ? error.message : 'the address was refused',
    };
  }
}
