import type { SelectType } from 'kysely';
import type { NixieTables } from './nixie-tables';

// A module's table map, held to the tables the migrations build, so typecheck fails where the two
// disagree. Views names the tables the module reads only part of, which may leave columns out.
// `bun run --cwd libs/db tables` rewrites nixie-tables.ts after a migration.
export type CheckedTables<
  Tables extends MatchedTables<Tables, Views>,
  Views extends keyof Tables = never,
> = Tables;

type MatchedTables<Tables, Views> = {
  readonly [Table in keyof Tables]: Table extends keyof NixieTables
    ? Table extends Views
      ? MatchedView<Tables[Table], NixieTables[Table]>
      : MatchedView<Tables[Table], NixieTables[Table]> &
          MissingColumns<Tables[Table], NixieTables[Table]>
    : 'no migration creates this table';
};

type MatchedView<Declared, Built> = {
  readonly [Column in keyof Declared]: Column extends keyof Built
    ? MatchedColumn<Declared[Column], Built[Column]>
    : 'no migration creates this column';
};

// Requires every built column the map leaves out, so the error names it.
type MissingColumns<Declared, Built> = Readonly<
  Record<Exclude<keyof Built, keyof Declared>, unknown>
>;

// The declared column itself when it matches, so the constraint holds, and a message otherwise.
type MatchedColumn<Declared, Built> = [SelectType<Declared>] extends [Built]
  ? null extends Built
    ? null extends SelectType<Declared>
      ? Declared
      : 'the migration lets this column hold null'
    : Declared
  : 'the migration gives this column another type';
