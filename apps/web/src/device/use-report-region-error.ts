import type { ContractClient } from '@heynixie/contract';
import { useNixieClient } from '../utils/use-nixie-client';

export interface RegionErrorReport {
  readonly region: string;

  // the short ID of the content that raised the error
  readonly shown: string;
  readonly message: string;
}

// Tells the server about an error that a region's content raised. A report that fails is lost, and
// the server answers STALE for content that the region no longer shows.
export function useReportRegionError(): (report: RegionErrorReport) => void {
  const nixie = useNixieClient();

  return (report) => {
    void sendReport(nixie.client, report);
  };
}

async function sendReport(client: ContractClient, report: RegionErrorReport): Promise<void> {
  try {
    await client.devices.pageError(report);
  } catch {
    // the report is lost, and the device reports the next error
  }
}
