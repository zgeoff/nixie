import type { RawBuilder } from 'kysely';
import { sql } from 'kysely';

export interface JSONLeaves {
  readonly from: RawBuilder<unknown>;
  readonly name: RawBuilder<unknown>;
  readonly value: RawBuilder<unknown>;
}

// The integer leaves of a JSON value, and of each JSON object or array stored inside one of its
// strings, as a projection stores an evidence column inside its change row. A leaf's name is its
// full path, with the path inside a nested string appended to the path of the string.
export function buildJSONLeaves(source: RawBuilder<unknown>): JSONLeaves {
  const outer = sql.ref('leaf_outer');
  const inner = sql.ref('leaf_inner');

  return {
    from: sql`json_tree(case when json_valid(${source}) then ${source} else 'null' end) as leaf_outer,
      json_tree(case
        when ${outer}.type = 'text' and json_valid(${outer}.atom)
          and substr(${outer}.atom, 1, 1) in ('{', '[')
        then ${outer}.atom else 'null' end) as leaf_inner`,
    name: sql`(${outer}.fullkey || case when ${inner}.type = 'integer'
      then substr(${inner}.fullkey, 2) else '' end)`,
    value: sql`(case when ${outer}.type = 'integer' then ${outer}.atom
      when ${inner}.type = 'integer' then ${inner}.atom end)`,
  };
}
