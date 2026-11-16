import type { JSONObject } from '@heynixie/log';

// The erasable field of definition.changed: the body of the record's hash
export interface StoredTaskDefinition {
  readonly definitionID: string;
  readonly hash: string;

  // parsed, defaults filled
  readonly form: JSONObject;

  // the exact text of each file
  readonly files: Readonly<Record<string, string>>;
}
