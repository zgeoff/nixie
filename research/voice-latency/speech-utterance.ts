import { z } from 'zod';

// The JSON beside each utterance's samples in a speech set folder. The speech downloader writes it
// and the end-of-turn runner reads it.
export const speechUtterance = z.object({ id: z.string(), text: z.string() });

export type SpeechUtterance = z.infer<typeof speechUtterance>;
