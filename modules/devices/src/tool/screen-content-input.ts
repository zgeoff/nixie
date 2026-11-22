import { screenMarkdownLimit } from '@heynixie/contract';

// The JSON schema of one block of screen content, as a tool takes it.
export const screenContentInput = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['markdown', 'image'] },
    text: {
      type: 'string',
      minLength: 1,
      maxLength: screenMarkdownLimit,
      description: 'for markdown: the text, rendered like a reply, with no raw HTML',
    },
    image: { type: 'string', minLength: 1, description: 'for an image: the image ID' },
    fit: {
      type: 'string',
      enum: ['whole', 'fill'],
      description:
        "for an image: 'whole' (the default) scales it to fit and centres it on black, 'fill' scales it to cover the screen and crops the overflow evenly from both sides",
    },
  },
  required: ['kind'],
  additionalProperties: false,
} as const;
