import { startONNXEncoder } from '@heynixie/encoder-onnx';
import type { CLIIO } from './types';

export async function checkEncoder(encoderDir: string, io: CLIIO): Promise<number> {
  const encoder = await startONNXEncoder(encoderDir);

  try {
    const [vector] = await encoder.encode(['which day does the recycling go out'], 'query');

    io.print(
      `the encoder in ${encoderDir} loaded and encoded a query as ${String(vector?.length ?? 0)} numbers`,
    );

    return 0;
  } finally {
    await encoder.stop();
  }
}
