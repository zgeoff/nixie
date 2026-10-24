import { join } from 'node:path';
import { realSpeechDir } from './real-speech.ts';

// Each speech set sits in its own folder of numbered utterances: <n>.f32 holds 16 kHz mono float
// samples and <n>.json the utterance's id and text. AMI keeps the folder the pause test reads.
export function speechSetDir(set: string): string {
  return set === 'ami' ? realSpeechDir : join(import.meta.dir, 'results', `speech-${set}`);
}
