import type { JSONObject, JSONValue } from '@heynixie/log';

// The input schema without one top-level argument: the property and the entry in `required`, at the
// root and in each member of its anyOf, oneOf and allOf. The model never supplies that argument, so
// the schema it is held to must not ask for it.
export function omitSchemaArgument(schema: JSONObject, name: string): JSONObject {
  return Object.fromEntries(
    Object.entries(schema).map(([keyword, value]) => [
      keyword,
      omitFromKeyword(keyword, value, name),
    ]),
  );
}

const unionKeywords = new Set(['anyOf', 'oneOf', 'allOf']);

function omitFromKeyword(keyword: string, value: JSONValue, name: string): JSONValue {
  if (keyword === 'properties' && isObject(value)) {
    return Object.fromEntries(Object.entries(value).filter(([property]) => property !== name));
  }

  if (keyword === 'required' && Array.isArray(value)) {
    return value.filter((entry) => entry !== name);
  }

  if (unionKeywords.has(keyword) && Array.isArray(value)) {
    return value.map((member) => (isObject(member) ? omitSchemaArgument(member, name) : member));
  }

  return value;
}

function isObject(value: JSONValue): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
