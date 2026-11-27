import { z } from 'zod';
import { pickReplyExpiry } from './pick-reply-expiry';

// An address that a send writes into a header: printable ASCII only, with an ASCII host.
const gmailAddressPattern = "^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+$";
const maxBodyChars = 100_000;
const maxAddresses = 20;
const maxFiles = 10;
const addressSchema = z.string().regex(new RegExp(gmailAddressPattern, 'u'));
const replyWakePattern = '^(off|[1-9][0-9]{0,6}(ms|s|m|h|d))$';

const bodyFields = {
  replyWake: z
    .string()
    .regex(new RegExp(replyWakePattern, 'u'))
    .refine((text) => pickReplyExpiry(text, 0).status === 'ok', {
      message: 'BAD_DURATION: replyWake is off, or a duration from 1m to 3650d',
    })
    .exactOptional(),
  text: z.string().min(1).max(maxBodyChars),
  html: z.string().max(maxBodyChars).nullable().exactOptional(),
  files: z.array(z.string()).max(maxFiles).exactOptional(),
  connection: z.string().exactOptional(),
};

const newMailFields = {
  to: z.array(addressSchema).min(1),
  cc: z.array(addressSchema).exactOptional(),
  bcc: z.array(addressSchema).exactOptional(),
  subject: z.string().min(1).max(998),
  ...bodyFields,
};

export const sendArgumentsSchema = z
  .strictObject(newMailFields)
  .refine(hasFewAddresses, { message: 'a mail takes up to 20 addresses in all' });

interface AddressLists {
  readonly to: readonly string[];
  readonly cc?: readonly string[];
  readonly bcc?: readonly string[];
}

function hasFewAddresses(mail: AddressLists): boolean {
  return mail.to.length + (mail.cc?.length ?? 0) + (mail.bcc?.length ?? 0) <= maxAddresses;
}

export const replyArgumentsSchema = z.strictObject({
  message: z.string(),
  replyAll: z.boolean().exactOptional(),
  ...bodyFields,
});

// `digest` is the fingerprint of the draft that the endpoint added before the decision; the model
// never passes it.
export const sendDraftArgumentsSchema = z.strictObject({
  draft: z.string(),
  digest: z.string(),
  connection: z.string().exactOptional(),
});

const addressesSchema = {
  type: 'array',
  items: { type: 'string', pattern: gmailAddressPattern },
  maxItems: maxAddresses,
} as const;

const bodyProperties = {
  replyWake: {
    type: 'string',
    pattern: replyWakePattern,
    description:
      'how long a reply to this mail wakes you: a duration from 1m, such as 2d, or off for none; ' +
      'the default is set by the deployment',
  },
  text: { type: 'string', minLength: 1, maxLength: maxBodyChars },
  html: {
    type: ['string', 'null'],
    maxLength: maxBodyChars,
    description: 'an HTML body beside the text',
  },
  files: {
    type: 'array',
    items: { type: 'string' },
    maxItems: maxFiles,
    description:
      "file IDs of the assistant's own files on this thread to attach, up to 10 and 25 MiB in all, " +
      'such as a drawing or a file a code run made',
  },
  connection: { type: 'string', description: 'the connection to send from, when 2 or more exist' },
} as const;

const { replyWake: _replyWake, ...draftBodyProperties } = bodyProperties;

const newMailProperties = {
  to: { ...addressesSchema, minItems: 1 },
  cc: addressesSchema,
  bcc: addressesSchema,
  subject: { type: 'string', minLength: 1, maxLength: 998 },
} as const;

export const newMailInputSchema = {
  type: 'object',
  properties: { ...newMailProperties, ...bodyProperties },
  required: ['to', 'subject', 'text'],
  additionalProperties: false,
} as const;

// A draft sends nothing, so it has no reply rule to set.
export const draftInputSchema = {
  type: 'object',
  properties: { ...newMailProperties, ...draftBodyProperties },
  required: ['to', 'subject', 'text'],
  additionalProperties: false,
} as const;

export const replyInputSchema = {
  type: 'object',
  properties: {
    message: { type: 'string', description: 'the ID of the message you answer' },
    replyAll: { type: 'boolean', description: 'true also answers the other recipients' },
    ...bodyProperties,
  },
  required: ['message', 'text'],
  additionalProperties: false,
} as const;

export const sendDraftInputSchema = {
  type: 'object',
  properties: {
    draft: { type: 'string', description: 'the ID of a draft from gmail.draft' },
    connection: { type: 'string' },
  },
  required: ['draft'],
  additionalProperties: false,
} as const;
