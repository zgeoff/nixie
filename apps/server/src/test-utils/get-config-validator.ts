import type { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020';
import { buildConfigJSONSchema } from '../build-config-json-schema';

const compiled: { validator: ValidateFunction | null } = { validator: null };

// Ajv compiles the whole config schema in a tenth of a second alone and in seconds beside the other
// test workers, so a process compiles it once and every test reuses the validator.
export function getConfigValidator(): ValidateFunction {
  compiled.validator ??= compileConfigValidator();

  return compiled.validator;
}

function compileConfigValidator(): ValidateFunction {
  const ajv = new Ajv2020({ allErrors: true, strict: true });

  addFormats(ajv);

  return ajv.compile(buildConfigJSONSchema());
}
