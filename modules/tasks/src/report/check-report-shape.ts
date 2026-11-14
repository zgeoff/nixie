import { buildSchemaParser } from '@heynixie/tools';
import { reportShapeSchema } from './report-shape-schema';
import type { FieldKeyword, FieldType, ReportShape, ShapeFault } from './types';

export const maxReportShapeCharacters = 4000;

const fieldTypes: readonly FieldType[] = [
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object',
];

export type ReportShapeCheck =
  | { readonly status: 'accepted'; readonly shape: ReportShape }
  | { readonly status: 'refused'; readonly fault: ShapeFault };

// A shape is the 2 keys properties and required, with every field a closed table of keywords. The
// result adds type object and additionalProperties false to the shape and to each object in it,
// and sorts the keys, so one shape always gives one JSON text.
export function checkReportShape(shape: unknown): ReportShapeCheck {
  const built = buildRoot(shape);

  if (built.status === 'refused') {
    return built;
  }

  const parsed = reportShapeSchema.safeParse(built.value);

  if (!parsed.success) {
    return { status: 'refused', fault: { fault: 'value', path: '', keyword: 'shape' } };
  }

  const size = JSON.stringify(parsed.data).length;

  if (size > maxReportShapeCharacters) {
    return {
      status: 'refused',
      fault: { fault: 'size', size, max: maxReportShapeCharacters },
    };
  }

  try {
    buildSchemaParser(parsed.data)({});
  } catch {
    return { status: 'refused', fault: { fault: 'value', path: '', keyword: 'schema' } };
  }

  return { status: 'accepted', shape: parsed.data };
}

type Built =
  | { readonly status: 'built'; readonly value: Readonly<Record<string, unknown>> }
  | { readonly status: 'refused'; readonly fault: ShapeFault };

function buildRoot(shape: unknown): Built {
  if (!isPlainObject(shape)) {
    return refuse({ fault: 'value', path: '', keyword: 'shape' });
  }

  const stray = Object.keys(shape).find((key) => key !== 'properties' && key !== 'required');

  if (stray !== undefined) {
    return refuse({ fault: 'keyword', path: '', keyword: stray });
  }

  return buildObject(shape, '', true);
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function refuse(fault: ShapeFault): Built {
  return { status: 'refused', fault };
}

const namePattern = /^[A-Za-z][A-Za-z0-9_]{0,39}$/u;

// An object holds properties and required, and a field of the type object may hold neither.
function buildObject(
  field: Readonly<Record<string, unknown>>,
  path: string,
  isRoot: boolean,
): Built {
  const properties = field['properties'];

  if (properties !== undefined && !isPlainObject(properties)) {
    return refuse({ fault: 'value', path, keyword: 'properties' });
  }

  const names = Object.keys(properties ?? {}).toSorted();

  if (isRoot && names.length === 0) {
    return refuse({ fault: 'value', path, keyword: 'properties' });
  }

  const built: Record<string, unknown> = {};

  for (const name of names) {
    const child = buildField(properties?.[name], joinPath(path, name));

    if (child.status === 'refused') {
      return child;
    }

    built[name] = child.value;
  }

  const required = field['required'];

  if (required !== undefined) {
    if (!Array.isArray(required) || !required.every((name) => typeof name === 'string')) {
      return refuse({ fault: 'value', path, keyword: 'required' });
    }

    const missing = required.find((name) => !(name in built));

    if (missing !== undefined) {
      return refuse({ fault: 'required', path, name: missing });
    }
  }

  const invalidName = names.find((name) => !namePattern.test(name));

  if (invalidName !== undefined) {
    return refuse({ fault: 'value', path: joinPath(path, invalidName), keyword: 'name' });
  }

  return {
    status: 'built',
    value: {
      ...(isRoot ? { type: 'object' } : {}),
      additionalProperties: false,
      properties: built,
      ...(required === undefined ? {} : { required: required.toSorted() }),
    },
  };
}

// One check per keyword of a field: whether the keyword's value reads and applies to the field's
// type. A keyword that FieldSchema lacks has no entry, so a field that uses one is refused.
const keywordChecks: Readonly<Record<FieldKeyword, (value: unknown, type: FieldType) => boolean>> =
  {
    type: (value) => typeof value === 'string' && fieldTypes.some((type) => type === value),
    description: (value) => typeof value === 'string' && value.length <= 200,
    enum: (value) =>
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 50 &&
      value.every(
        (entry) =>
          typeof entry === 'string' || (typeof entry === 'number' && Number.isFinite(entry)),
      ),
    items: (_value, type) => type === 'array',
    properties: (_value, type) => type === 'object',
    required: (value, type) =>
      type === 'object' && Array.isArray(value) && value.every((name) => typeof name === 'string'),
    maxLength: (value, type) => type === 'string' && Number.isInteger(value) && Number(value) >= 0,
    maxItems: (value, type) => type === 'array' && Number.isInteger(value) && Number(value) >= 0,
    minimum: (value, type) => (type === 'number' || type === 'integer') && Number.isFinite(value),
    maximum: (value, type) => (type === 'number' || type === 'integer') && Number.isFinite(value),
  };

export const reportShapeKeywords: readonly FieldKeyword[] = Object.keys(keywordChecks).filter(
  (keyword): keyword is FieldKeyword => keyword in keywordChecks,
);

function buildField(field: unknown, path: string): Built {
  if (!isPlainObject(field)) {
    return refuse({ fault: 'value', path, keyword: 'field' });
  }

  const type = field['type'];
  const fieldType = fieldTypes.find((candidate) => candidate === type);

  if (fieldType === undefined) {
    return refuse({ fault: 'value', path, keyword: 'type' });
  }

  const fault = findKeywordFault(field, path, fieldType);

  if (fault !== null) {
    return refuse(fault);
  }

  const built: Record<string, unknown> = {};

  for (const keyword of reportShapeKeywords) {
    if (keyword in field && keyword !== 'items' && keyword !== 'properties') {
      built[keyword] = field[keyword];
    }
  }

  if (fieldType === 'array' && field['items'] !== undefined) {
    const items = buildField(field['items'], `${path}[]`);

    if (items.status === 'refused') {
      return items;
    }

    built['items'] = items.value;
  }

  if (fieldType === 'object') {
    const object = buildObject(field, path, false);

    if (object.status === 'refused') {
      return object;
    }

    return {
      status: 'built',
      value: sortKeys({ ...built, ...object.value }),
    };
  }

  return { status: 'built', value: sortKeys(built) };
}

function findKeywordFault(
  field: Readonly<Record<string, unknown>>,
  path: string,
  type: FieldType,
): ShapeFault | null {
  for (const [keyword, value] of Object.entries(field)) {
    const check = reportShapeKeywords.find((candidate) => candidate === keyword);

    if (check === undefined) {
      return { fault: 'keyword', path, keyword };
    }

    if (!keywordChecks[check](value, type)) {
      return { fault: 'value', path, keyword };
    }
  }

  return null;
}

function sortKeys(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .toSorted(([left], [right]) => (left < right ? -1 : 1)),
  );
}

function joinPath(path: string, name: string): string {
  return path === '' ? name : `${path}.${name}`;
}
