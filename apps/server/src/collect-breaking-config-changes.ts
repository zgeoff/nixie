// A node of the JSON Schema that buildConfigJSONSchema emits
type SchemaNode = Readonly<Record<string, unknown>>;

// Collects each change from the released config schema to the current one that can refuse a
// config.yaml the released schema accepts, as `<path>: <change>`. A change it cannot prove
// harmless counts as breaking, so the list can hold a false alarm but never misses a break.
export function collectBreakingConfigChanges(
  released: SchemaNode,
  current: SchemaNode,
): readonly string[] {
  return collectNodeChanges(released, current, []);
}

function collectNodeChanges(
  released: SchemaNode,
  current: SchemaNode,
  path: readonly string[],
): readonly string[] {
  const keywords = new Set([...Object.keys(released), ...Object.keys(current)]);

  return [...keywords].flatMap((keyword) =>
    collectKeywordChanges({
      keyword,
      before: released[keyword],
      after: current[keyword],
      current,
      path,
    }),
  );
}

// One keyword's value in the released node and in the current node, which holds it
interface KeywordChange {
  readonly keyword: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly current: SchemaNode;
  readonly path: readonly string[];
}

// keywords that annotate a schema and never refuse a value
const annotations = new Set(['$schema', 'title', 'description', 'default', 'examples']);

// properties alone refuses nothing, and required lists keys rather than narrowing one
const listCollectors: Readonly<Record<string, (change: KeywordChange) => readonly string[]>> = {
  properties: collectPropertyChanges,
  required: collectRequiredChanges,
};

function collectKeywordChanges(change: KeywordChange): readonly string[] {
  if (annotations.has(change.keyword) || Bun.deepEquals(change.before, change.after)) {
    return [];
  }

  const collect = listCollectors[change.keyword] ?? collectNarrowingChanges;

  return collect(change);
}

const narrowingCollectors: Readonly<Record<string, (change: KeywordChange) => readonly string[]>> =
  {
    minimum: collectLowerBoundChange,
    exclusiveMinimum: collectLowerBoundChange,
    minLength: collectLowerBoundChange,
    minItems: collectLowerBoundChange,
    minProperties: collectLowerBoundChange,
    maximum: collectUpperBoundChange,
    exclusiveMaximum: collectUpperBoundChange,
    maxLength: collectUpperBoundChange,
    maxItems: collectUpperBoundChange,
    maxProperties: collectUpperBoundChange,
    type: collectTypeChange,
    enum: collectEnumChanges,
    additionalProperties: (change) => collectSubschemaChanges(change, '*'),
    items: (change) => collectSubschemaChanges(change, '[]'),
    propertyNames: (change) => collectSubschemaChanges(change, '(key)'),
    anyOf: collectChoiceChanges,
    oneOf: collectChoiceChanges,
  };

// every keyword but these only narrows what passes, so dropping one refuses nothing
function collectNarrowingChanges(change: KeywordChange): readonly string[] {
  if (change.after === undefined) {
    return [];
  }

  if (change.before === undefined) {
    return [`${formatPath(change.path)}: adds ${change.keyword}`];
  }

  const collect = narrowingCollectors[change.keyword] ?? collectAnyChange;

  return collect(change);
}

// A key the current schema drops passes only where additionalProperties accepts any value
function collectPropertyChanges(change: KeywordChange): readonly string[] {
  const before = toNode(change.before);
  const after = toNode(change.after);
  const extra = change.current['additionalProperties'];
  const acceptsAnyKey = extra === undefined || extra === true;

  return Object.keys(before).flatMap((key) => {
    const path = [...change.path, key];

    if (after[key] !== undefined) {
      return collectNodeChanges(toNode(before[key]), toNode(after[key]), path);
    }

    return acceptsAnyKey ? [] : [`${formatPath(path)}: is no longer accepted`];
  });
}

function collectRequiredChanges(change: KeywordChange): readonly string[] {
  const before = toArray(change.before ?? []);

  return toArray(change.after ?? [])
    .filter((key) => !before.includes(key))
    .map((key) => `${formatPath([...change.path, String(key)])}: becomes required`);
}

function collectAnyChange(change: KeywordChange): readonly string[] {
  return [`${formatPath(change.path)}: changes ${change.keyword}`];
}

function collectLowerBoundChange(change: KeywordChange): readonly string[] {
  return Number(change.after) > Number(change.before)
    ? [`${formatPath(change.path)}: raises ${change.keyword} to ${String(change.after)}`]
    : [];
}

function collectUpperBoundChange(change: KeywordChange): readonly string[] {
  return Number(change.after) < Number(change.before)
    ? [`${formatPath(change.path)}: lowers ${change.keyword} to ${String(change.after)}`]
    : [];
}

// a number accepts every integer, so an integer that becomes a number refuses nothing
function collectTypeChange(change: KeywordChange): readonly string[] {
  const after = toArray(change.after);

  const isKept = (type: unknown): boolean =>
    after.includes(type) || (type === 'integer' && after.includes('number'));

  return toArray(change.before).every((type) => isKept(type))
    ? []
    : [`${formatPath(change.path)}: changes type to ${JSON.stringify(change.after)}`];
}

function collectEnumChanges(change: KeywordChange): readonly string[] {
  const after = toArray(change.after);

  return toArray(change.before)
    .filter((value) => !after.some((kept) => Bun.deepEquals(kept, value)))
    .map((value) => `${formatPath(change.path)}: drops the value ${JSON.stringify(value)}`);
}

// A subschema is a schema object, or true or false for any value or none
function collectSubschemaChanges(change: KeywordChange, segment: string): readonly string[] {
  const path = [...change.path, segment];

  if (change.after === true || change.before === false) {
    return [];
  }

  if (change.after === false || change.before === true) {
    return [`${formatPath(path)}: narrows ${change.keyword}`];
  }

  return collectNodeChanges(toNode(change.before), toNode(change.after), path);
}

// oneOf refuses a value that matches two choices, and a choice the current schema adds could match
// a value that a released choice matches, so oneOf passes only the same number of choices
function collectChoiceChanges(change: KeywordChange): readonly string[] {
  const before = toArray(change.before);
  const after = toArray(change.after);

  if (change.keyword === 'oneOf' && before.length !== after.length) {
    return [`${formatPath(change.path)}: changes the oneOf choices`];
  }

  return before.flatMap((choice, index) =>
    index < after.length
      ? collectNodeChanges(toNode(choice), toNode(after[index]), change.path)
      : [`${formatPath(change.path)}: drops ${change.keyword} choice ${index + 1}`],
  );
}

function formatPath(path: readonly string[]): string {
  return path.length === 0 ? '(root)' : path.join('.');
}

function toNode(value: unknown): SchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as SchemaNode)
    : {};
}

function toArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [value];
}
