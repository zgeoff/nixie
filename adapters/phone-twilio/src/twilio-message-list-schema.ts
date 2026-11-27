import { z } from 'zod';

// The parts of Twilio's Messages API
// (https://www.twilio.com/docs/messaging/api/message-resource) that nixie sends and reads.

const twilioMessageSchema = z.object({
  sid: z.string(),
  from: z.string(),
  to: z.string(),
  body: z.string(),
  direction: z.string(),

  // RFC 2822 text; null until Twilio has sent or received the message
  date_sent: z.string().nullable(),
  date_created: z.string().nullable(),
});

export type TwilioMessage = z.output<typeof twilioMessageSchema>;

export const twilioMessageListSchema = z.object({
  messages: z.array(twilioMessageSchema),

  // a path on the API's origin, or null on the last page
  next_page_uri: z.string().nullable(),
});

export type TwilioMessageList = z.input<typeof twilioMessageListSchema>;

export const twilioCreatedSchema = z.object({ sid: z.string() });

export const twilioErrorSchema = z.object({
  code: z.int().nullable().optional(),
  message: z.string().optional(),
});
