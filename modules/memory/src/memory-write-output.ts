// The output of memory.remember and memory.retire: the item and version a write applied, or the
// proposal it waits in with the review reason, and whether it merged into a pending proposal of the
// same change, so the model can tell the user what happened.
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
