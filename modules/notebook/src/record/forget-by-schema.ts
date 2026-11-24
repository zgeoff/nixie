import { z } from 'zod';

// Who forgot the note. A record that predates the field reads as the user's forget.
export const forgetBySchema = z.enum(['user', 'assistant']).default('user');
