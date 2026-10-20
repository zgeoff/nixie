// Collects each change from the released config schema to the current one that can refuse a
// config.yaml the released schema accepts, as `<path>: <change>`. A change it cannot prove
// harmless counts as breaking, so the list can hold a false alarm but never misses a break.
export function collectBreakingConfigChanges(
  released: unknown,
  current: unknown,
): readonly string[] {
  return collectNodeChanges(toNode(released), toNode(current), []);
}

// A node of the JSON Schema that buildConfigJSONSchema emits
type SchemaNode = Readonly<Record<string, unknown>>;

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
      released,
      current,
      path,
    }),
  );
}

// One keyword's value in the released node and in the current node, which hold it
interface KeywordChange {
  readonly keyword: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly released: SchemaNode;
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

// keywords that only narrow what passes, so dropping one refuses nothing; a keyword such as
// prefixItems also exempts values from another keyword, so dropping it can refuse a value
const droppable = new Set([
  ...Object.keys(narrowingCollectors),
  'const',
  'multipleOf',
  'pattern',
  'format',
  'uniqueItems',
  'allOf',
  'not',
  'contains',
  'minContains',
  'maxContains',
  'dependentRequired',
]);

// A key the current schema drops passes only where additionalProperties accepts any value, and a key
// it names for the first time had to pass the released additionalProperties
function collectPropertyChanges(change: KeywordChange): readonly string[] {
  const before = toNode(change.before);
  const after = toNode(change.after);

  return [
    ...Object.keys(before).flatMap((key) => collectKeptPropertyChanges(change, key)),
    ...Object.keys(after)
      .filter((key) => before[key] === undefined)
      .flatMap((key) => collectNamedPropertyChanges(change, key)),
  ];
}

function toNode(value: unknown): SchemaNode {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const entries: readonly (readonly [string, unknown])[] = Object.entries(value);

  return Object.fromEntries(entries);
}

function collectKeptPropertyChanges(change: KeywordChange, key: string): readonly string[] {
  const path = [...change.path, key];
  const kept = toNode(change.after)[key];
  const extra = change.current['additionalProperties'];

  if (kept !== undefined) {
    return collectNodeChanges(toNode(toNode(change.before)[key]), toNode(kept), path);
  }

  return extra === undefined || extra === true
    ? []
    : [`${formatPath(path)}: is no longer accepted`];
}

function formatPath(path: readonly string[]): string {
  return path.length === 0 ? '(root)' : path.join('.');
}

function collectNamedPropertyChanges(change: KeywordChange, key: string): readonly string[] {
  const path = [...change.path, key];
  const extra = change.released['additionalProperties'] ?? true;
  const named = toNode(toNode(change.after)[key]);

  if (extra === false) {
    return [];
  }

  if (extra === true) {
    return Object.keys(named).every((keyword) => annotations.has(keyword))
      ? []
      : [`${formatPath(path)}: constrains a key that any value passed`];
  }

  return collectNodeChanges(toNode(extra), named, path);
}

function collectRequiredChanges(change: KeywordChange): readonly string[] {
  const before = toArray(change.before ?? []);

  return toArray(change.after ?? [])
    .filter((key) => !before.includes(key))
    .map((key) => `${formatPath([...change.path, String(key)])}: becomes required`);
}

function toArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [value];
}

function collectNarrowingChanges(change: KeywordChange): readonly string[] {
  if (change.after === undefined) {
    return droppable.has(change.keyword)
      ? []
      : [`${formatPath(change.path)}: drops ${change.keyword}`];
  }

  if (change.before === undefined) {
    return [`${formatPath(change.path)}: adds ${change.keyword}`];
  }

  const collect = narrowingCollectors[change.keyword] ?? collectAnyChange;

  return collect(change);
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

// oneOf refuses a value that matches two choices, and any change to a choice can make a value that
// matched one choice match two, so every oneOf change counts
function collectChoiceChanges(change: KeywordChange): readonly string[] {
  const before = toArray(change.before);
  const after = toArray(change.after);

  if (change.keyword === 'oneOf') {
    return [`${formatPath(change.path)}: changes the oneOf choices`];
  }

  return before.flatMap((choice, index) =>
    index < after.length
      ? collectNodeChanges(toNode(choice), toNode(after[index]), change.path)
      : [`${formatPath(change.path)}: drops ${change.keyword} choice ${index + 1}`],
  );
}

function collectAnyChange(change: KeywordChange): readonly string[] {
  return [`${formatPath(change.path)}: changes ${change.keyword}`];
}
