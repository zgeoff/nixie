import Ajv2020 from 'ajv/dist/2020';

// A shipped config.yaml reaches a deployment that runs the release its recipe pins, so that
// release's own schema has to accept it. Returns the first refusal, or null when the schema
// accepts the config.
export function findConfigProblem(schema: unknown, config: unknown): string | null {
  if (!isRecord(schema)) {
    return 'the schema is not an object';
  }

  const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(schema);

  if (validate(config)) {
    return null;
  }

  const [first] = validate.errors ?? [];

  if (first === undefined) {
    return 'the schema refuses the config';
  }

  return `${first.instancePath === '' ? 'the config' : first.instancePath} ${first.message ?? 'is refused'}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
