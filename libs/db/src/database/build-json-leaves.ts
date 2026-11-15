import type { RawBuilder } from 'kysely';
import { sql } from 'kysely';

export interface JSONLeaves {
  readonly from: RawBuilder<unknown>;
  readonly name: RawBuilder<unknown>;
  readonly value: RawBuilder<unknown>;
}

export interface JSONLeavesOptions {
  readonly isNestedDecoded: boolean;
}

// The integer leaves of a JSON value. A projection stores a JSON column, such as evidence, as a
// string inside its change row, so a projection's leaves also come from each JSON object or array
// held in a string. A record's payload holds free text there instead, which names nothing.
export function buildJSONLeaves(
  source: RawBuilder<unknown>,
  options: JSONLeavesOptions,
): JSONLeaves {
  const outer = sql.ref('leaf_outer');
  const inner = sql.ref('leaf_inner');
  const trimmed = sql`ltrim(${outer}.atom, ${' \t\n\r'})`;

  const nested = options.isNestedDecoded
    ? sql`case when ${outer}.type = 'text' and json_valid(${outer}.atom)
        and substr(${trimmed}, 1, 1) in ('{', '[')
      then ${outer}.atom else 'null' end`
    : sql`'null'`;

  return {
    from: sql`json_tree(case when json_valid(${source}) then ${source} else 'null' end) as leaf_outer,
      json_tree(${nested}) as leaf_inner`,
    name: sql`(${outer}.fullkey || case when ${inner}.type = 'integer'
      then substr(${inner}.fullkey, 2) else '' end)`,
    value: sql`(case when ${outer}.type = 'integer' then ${outer}.atom
      when ${inner}.type = 'integer' then ${inner}.atom end)`,
  };
}
