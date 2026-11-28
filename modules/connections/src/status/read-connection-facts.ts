import { readGranted, readMissing } from '../connection/list-connections';
import { openConnectionValues } from '../connection/open-connection-values';
import type { ServiceContext } from '../service-context';
import type { ConnectionRow } from '../types';
import { collectCoveredToolNames } from './collect-covered-tool-names';
import type { ConnectionFacts } from './types';

// What a line about each connection reads when it is built, by connection ID. The label and the
// account sit sealed under the connection's key, so no record holds them. A connection whose key is
// gone has no entry, and one whose account holds no address reads an empty account.
export async function readConnectionFacts(
  context: ServiceContext,
  rows: readonly ConnectionRow[],
): Promise<ReadonlyMap<string, ConnectionFacts>> {
  const opened = await openConnectionValues(context.log, rows);

  return new Map(
    rows.flatMap((row): [string, ConnectionFacts][] => {
      const values = opened.get(row.connection_id);

      if (values === undefined || values.label === null) {
        return [];
      }

      return [
        [
          row.connection_id,
          {
            connection: row.short_id,
            connector: row.connector_id,
            label: values.label,
            account: values.account?.email ?? '',
            lastSuccessAtMs: row.last_success_at,
            toolNames: collectCoveredToolNames(context.connector.actions, {
              granted: readGranted(row),
              missing: readMissing(row),
            }),
          },
        ],
      ];
    }),
  );
}
