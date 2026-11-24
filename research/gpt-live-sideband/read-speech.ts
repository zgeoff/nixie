// Synthetic speech for the device's microphone: OpenAI's speech endpoint, as raw PCM16 at 24 kHz,
// cached under results/ so a rerun pays for each line once.
import { createHash } from 'node:crypto';

const speechModel = 'tts-1';
const speechVoice = 'alloy';

export async function readSpeech(text: string, key: string): Promise<{ characters: number; pcmBase64: string }> {
  const hash = createHash('sha256').update(`${speechModel}/${speechVoice}/${text}`).digest('hex').slice(0, 16);
  const cached = Bun.file(new URL(`./results/speech/${hash}.pcm`, import.meta.url).pathname);
  if (await cached.exists()) {
    return { characters: 0, pcmBase64: Buffer.from(await cached.arrayBuffer()).toString('base64') };
  }
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    body: JSON.stringify({ input: text, model: speechModel, response_format: 'pcm', voice: speechVoice }),
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`speech: ${response.status} ${await response.text()}`);
  }
  const pcm = await response.arrayBuffer();
  await Bun.write(cached, pcm);
  return { characters: text.length, pcmBase64: Buffer.from(pcm).toString('base64') };
}
