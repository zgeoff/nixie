import { collectSchemaPaths } from './collect-schema-paths';

// The path of every argument of an input schema, whatever its type, in the grammar that
// collectStringArguments uses. An override names an argument by one of these paths.
export function collectArgumentPaths(schema: unknown): readonly string[] {
  return collectSchemaPaths(schema, () => true);
}
