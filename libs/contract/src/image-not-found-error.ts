// conversation.readImage's answer for an image that is not there to read: no such message, no image
// at the position, or a message forgotten since.
export const imageNotFoundError = {
  message: 'No readable image of a message has this position',
  status: 404,
} as const;
