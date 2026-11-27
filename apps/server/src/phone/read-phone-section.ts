import { phoneConfigSchema } from '@heynixie/phone';
import type { z } from 'zod';
import type { PhoneSection } from './phone-section';
import { accountSIDSchema, apiKeySIDSchema } from './twilio-config-schema';

type ReadSetting = (reference: string, configKey: string) => string;

// Replaces each reference in the section with the value of the settings entry it names, and checks
// that value against the pattern of a plain one. Neither error quotes a value.
export function readPhoneSection(
  section: PhoneSection | undefined,
  readSetting: ReadSetting,
): PhoneSection | undefined {
  if (section === undefined) {
    return undefined;
  }

  const resolveValue = (value: string, configKey: string, schema: z.ZodType<string>): string => {
    if (!value.startsWith('deployment:')) {
      return value;
    }

    const entry = readSetting(value, configKey);

    if (!schema.safeParse(entry).success) {
      throw new Error(`${configKey} is ${value}, and its settings entry is not a valid value`);
    }

    return entry;
  };

  return {
    ...section,
    number: resolveValue(section.number, 'phone.number', phoneConfigSchema.shape.number),
    twilio: {
      ...section.twilio,
      account_sid: resolveValue(
        section.twilio.account_sid,
        'phone.twilio.account_sid',
        accountSIDSchema,
      ),
      api_key_sid: resolveValue(
        section.twilio.api_key_sid,
        'phone.twilio.api_key_sid',
        apiKeySIDSchema,
      ),
    },
  };
}
