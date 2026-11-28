import { z } from 'zod';

// the places of a proposal card that stay ticked, by their place in its list
export const tickedPlacesSchema = z.array(z.int().nonnegative()).max(100);
