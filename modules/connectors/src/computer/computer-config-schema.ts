import { z } from 'zod';

export const computerConfigSchema = z.strictObject({
  // a hold on the desktop with no input from its device this long ends, as `idle`
  idle_hand_back_minutes: z.number().int().positive().default(30),

  // an ask for a take-over that no one answers this long closes, as `expired`
  handover_expiry_minutes: z.number().int().positive().default(60),
});
