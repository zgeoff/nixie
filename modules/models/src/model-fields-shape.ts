import { z } from 'zod';

// The fields every record of model output carries: the model and the profile in force for the call,
// set by nixie and never taken from anything the model sent.
export const modelFieldsShape = { model: z.string(), profile: z.string() };
