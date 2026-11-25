import { z } from 'zod';

// An address that a send writes into a header: printable ASCII only, with an ASCII host.
export const gmailAddressPattern =
  "^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+$";

export const maxBodyChars = 100_000;
export const maxAddresses = 20;
export const maxFiles = 10;
const addressSchema = z.string().regex(new RegExp(gmailAddressPattern, 'u'));

const bodyFields = {
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

export const draftArgumentsSchema = sendArgumentsSchema;

export const replyArgumentsSchema = z.strictObject({
  message: z.string(),
  replyAll: z.boolean().exactOptional(),
  ...bodyFields,
});

export const sendDraftArgumentsSchema = z.strictObject({
  draft: z.string(),
  connection: z.string().exactOptional(),
});

const addressesSchema = {
  type: 'array',
  items: { type: 'string', pattern: gmailAddressPattern },
  maxItems: maxAddresses,
} as const;

const bodyProperties = {
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

export const newMailInputSchema = {
  type: 'object',
  properties: {
    to: { ...addressesSchema, minItems: 1 },
    cc: addressesSchema,
    bcc: addressesSchema,
    subject: { type: 'string', minLength: 1, maxLength: 998 },
    ...bodyProperties,
  },
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
