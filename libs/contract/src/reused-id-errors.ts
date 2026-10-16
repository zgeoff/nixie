// Every checked action refuses a client action ID that arrived before with a different input.
export const reusedIDErrors = {
  CLIENT_ACTION_ID_REUSED: {
    message: 'The client action ID belongs to a different action',
    status: 409,
  },
};
