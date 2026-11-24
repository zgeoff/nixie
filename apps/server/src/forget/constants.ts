export const stuckForgetsOutput = {
  type: 'object',
  properties: {
    stuck: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: 'what the forget removes, such as note or moment' },
          id: { type: ['string', 'null'], description: 'its short ID, null when it has none' },
          openMinutes: { type: 'integer', description: 'whole minutes since the forget started' },
        },
        required: ['kind', 'id', 'openMinutes'],
        additionalProperties: false,
      },
    },
  },
  required: ['stuck'],
  additionalProperties: false,
} as const;

export const stuckForgetsResults = { stuck: 'owner_data' } as const;

export const erasureNotStartedMessage =
  'nixie has not started its forgets yet; try again in a moment';
