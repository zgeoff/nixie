// Whether the new input schema may accept what the old one did not, such as a new property or a
// removed limit. A tool whose input widens stops. A change that keeps the shape, such as a new
// description, does not.
export function hasWidenedInput(before: unknown, after: unknown): boolean {
  return !isNoWider(before, after);
}

function isNoWider(before: unknown, after: unknown): boolean {
  if (Array.isArray(before) || Array.isArray(after)) {
    return isSame(stripAnnotations(before), stripAnnotations(after));
  }

  if (!isRecord(before) || !isRecord(after)) {
    return isSame(before, after);
  }

  const old = stripAnnotations(before);
  const next = stripAnnotations(after);

  if (!isRecord(old) || !isRecord(next)) {
    return isSame(old, next);
  }

  const oldKeys = Object.keys(old);

  return (
    oldKeys.every((key) => isKeywordNoWider(key, old[key], next[key], next)) &&
    Object.keys(next)
      .filter((key) => !oldKeys.includes(key))
      .every((key) => isNewKeywordNarrowing(key, next[key]))
  );
}

function isSame(first: unknown, second: unknown): boolean {
  return JSON.stringify(sortKeys(first)) === JSON.stringify(sortKeys(second));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => sortKeys(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .toSorted(([first], [second]) => first.localeCompare(second))
      .map(([key, item]) => [key, sortKeys(item)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Keywords that describe a schema to a reader and decide nothing about what it accepts.
const annotationKeywords: ReadonlySet<string> = new Set([
  '$comment',
  '$id',
  '$schema',
  'default',
  'deprecated',
  'description',
  'examples',
  'readOnly',
  'title',
  'writeOnly',
]);

function stripAnnotations(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => stripAnnotations(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !annotationKeywords.has(key))
      .map(([key, item]) => [key, stripKeyword(key, item)]),
  );
}

// Keywords whose value maps names to schemas, so a property named like an annotation stays.
const schemaMapKeywords: ReadonlySet<string> = new Set([
  '$defs',
  'definitions',
  'dependentSchemas',
  'patternProperties',
  'properties',
]);

// Keywords whose value is data, never a schema.
const dataKeywords: ReadonlySet<string> = new Set(['const', 'enum']);

function stripKeyword(key: string, item: unknown): unknown {
  if (dataKeywords.has(key)) {
    return item;
  }

  if (schemaMapKeywords.has(key) && isRecord(item)) {
    return Object.fromEntries(
      Object.entries(item).map(([name, schema]) => [name, stripAnnotations(schema)]),
    );
  }

  return stripAnnotations(item);
}

const lowerBounds: ReadonlySet<string> = new Set([
  'exclusiveMinimum',
  'minItems',
  'minLength',
  'minProperties',
  'minimum',
]);

const upperBounds: ReadonlySet<string> = new Set([
  'exclusiveMaximum',
  'maxItems',
  'maxLength',
  'maxProperties',
  'maximum',
]);

// Whether the keyword of the new schema accepts no more than the old keyword did. A missing new
// keyword accepts more, except for `properties`, which the next function judges.
function isKeywordNoWider(
  key: string,
  oldValue: unknown,
  newValue: unknown,
  next: Record<string, unknown>,
): boolean {
  if (key === 'properties') {
    return isPropertiesNoWider(oldValue, newValue, next);
  }

  if (newValue === undefined) {
    return false;
  }

  if (key === 'required') {
    return isSuperset(newValue, oldValue);
  }

  if (key === 'enum') {
    return isSuperset(oldValue, newValue);
  }

  if (key === 'type') {
    return isSuperset(toList(oldValue), toList(newValue));
  }

  if (lowerBounds.has(key)) {
    return typeof oldValue === 'number' && typeof newValue === 'number' && newValue >= oldValue;
  }

  if (upperBounds.has(key)) {
    return typeof oldValue === 'number' && typeof newValue === 'number' && newValue <= oldValue;
  }

  if (key === 'items' || key === 'additionalProperties') {
    return isSchemaNoWider(oldValue, newValue);
  }

  return isSame(oldValue, newValue);
}

function isPropertiesNoWider(
  oldValue: unknown,
  newValue: unknown,
  next: Record<string, unknown>,
): boolean {
  if (!isRecord(oldValue) || !isRecord(newValue)) {
    return isSame(oldValue, newValue);
  }

  // a dropped property is still accepted unless the schema refuses extra ones and no pattern takes it
  const isClosed = next['additionalProperties'] === false;

  const patterns = isRecord(next['patternProperties'])
    ? Object.keys(next['patternProperties'])
    : [];

  return (
    Object.keys(newValue).every((name) => Object.hasOwn(oldValue, name)) &&
    Object.entries(oldValue).every(([name, schema]) =>
      Object.hasOwn(newValue, name)
        ? isNoWider(schema, newValue[name])
        : isClosed && !patterns.some((pattern) => isMatchedBy(pattern, name)),
    )
  );
}

// An unreadable pattern counts as a match, so the change waits for your accept.
function isMatchedBy(pattern: string, name: string): boolean {
  try {
    return new RegExp(pattern, 'u').test(name);
  } catch {
    return true;
  }
}

// Whether every member of `inner` is a member of `outer`.
function isSuperset(outer: unknown, inner: unknown): boolean {
  if (!Array.isArray(outer) || !Array.isArray(inner)) {
    return false;
  }

  return inner.every((member: unknown) => outer.some((other: unknown) => isSame(member, other)));
}

function toList(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [value];
}

function isSchemaNoWider(before: unknown, after: unknown): boolean {
  if (typeof before === 'boolean' || typeof after === 'boolean') {
    return before === after || after === false || before === true;
  }

  return isNoWider(before, after);
}

// Whether a keyword that the old schema lacked can only narrow what the schema accepts.
function isNewKeywordNarrowing(key: string, value: unknown): boolean {
  if (key === 'additionalProperties') {
    return value === false;
  }

  if (key === 'uniqueItems') {
    return value === true;
  }

  return (
    key === 'required' ||
    key === 'enum' ||
    key === 'const' ||
    key === 'pattern' ||
    lowerBounds.has(key) ||
    upperBounds.has(key)
  );
}
