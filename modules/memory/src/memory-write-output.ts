export const memoryWriteOutput = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['applied', 'proposed'] },
    itemID: { type: 'string' },
    version: { type: 'integer' },
    proposalID: { type: 'string' },
    reason: { type: 'string' },
    merged: { type: 'boolean' },
  },
  required: ['status'],
  additionalProperties: false,
};
