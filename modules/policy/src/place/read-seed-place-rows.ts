import type { Transaction } from 'kysely';
import type { PolicyTables } from '../policy/policy-tables';
import type { SeedPlaceRow } from './types';
import { trustLevels } from './types';

// The site and mail domain entries that are in the directory now, which hold their key in the
// projection. An address, a number or a handle never comes from the definitions repo.
export async function readSeedPlaceRows(
  tx: Transaction<unknown>,
): Promise<readonly SeedPlaceRow[]> {
  const rows = await tx
    .$extendTables<PolicyTables>()
    .selectFrom('places')
    .selectAll()
    .where('removed_sequence', 'is', null)
    .where('kind', 'in', ['site', 'mail_domain'])
    .execute();

  return rows.flatMap((row): SeedPlaceRow[] => {
    const trust = trustLevels.find((level) => level === row.trust);

    if (trust === undefined || row.domain === null) {
      return [];
    }

    const key = {
      kind: row.kind === 'site' ? ('site' as const) : ('mail_domain' as const),
      domain: row.domain,
      subdomains: row.subdomains === 1,
    };

    return [
      {
        placeID: row.place_id,
        key,
        trust,
        name: row.name,
        addedBy: row.added_by,
        isChanged: row.name_sequence !== null,
      },
    ];
  });
}
