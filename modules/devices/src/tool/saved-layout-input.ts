const nameLimit = 64;

// The input shapes that the saved-layout tools share.
export const savedLayoutInput = {
  nameLimit,
  name: {
    type: 'string',
    minLength: 1,
    maxLength: nameLimit,
    description: `the name of the saved layout, 1 to ${String(nameLimit)} characters, such as evening`,
  },
  device: { type: 'string', minLength: 1, description: 'the shortID from devices.list' },
  refusalProperties: {
    refused: { type: 'string', description: 'the code of the refusal' },
    message: { type: 'string' },
  },
};
