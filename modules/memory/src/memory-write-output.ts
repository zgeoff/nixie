// The output of memory.remember and memory.retire. A write that applied returns its item and
// version, and one that waits for review returns its proposal and the review reason, so the model
// can tell the user what happened.
export const memoryWriteOutput = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['applied', 'proposed'] },
    itemID: { type: 'string' },
    version: { type: 'integer' },
    proposalID: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['status'],
  additionalProperties: false,
};
