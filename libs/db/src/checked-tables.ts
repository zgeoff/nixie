import type { SelectType } from 'kysely';
import type { NixieTables } from './nixie-tables';

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

type MissingColumns<Declared, Built> = Readonly<
  Record<Exclude<keyof Built, keyof Declared>, unknown>
>;

type MatchedColumn<Declared, Built> = [SelectType<Declared>] extends [Built]
  ? null extends Built
    ? null extends SelectType<Declared>
      ? Declared
      : 'the migration lets this column hold null'
    : Declared
  : 'the migration gives this column another type';
