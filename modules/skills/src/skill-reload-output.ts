export const skillReloadOutput = {
  type: 'object',
  properties: {
    skills: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          oldVersion: { type: ['string', 'null'] },
          newVersion: { type: ['string', 'null'] },
        },
        required: ['name', 'oldVersion', 'newVersion'],
        additionalProperties: false,
      },
    },
  },
  required: ['skills'],
  additionalProperties: false,
};
