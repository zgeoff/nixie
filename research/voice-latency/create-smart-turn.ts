// Pipecat Smart Turn v3.2, the int8 CPU build: it reads the last 8 s of a turn's audio and returns
// the probability that the speaker has finished.
import { join } from 'node:path';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import { buildLogMel, melBins, melFrames } from './build-log-mel.ts';
import { modelsDir } from './speech.ts';

export const smartTurnModel = join(modelsDir, 'smart-turn-v3.2-cpu.onnx');

export async function createSmartTurn(): Promise<{ readEndProbability: (audio: Float32Array) => Promise<number> }> {
  const session = await InferenceSession.create(smartTurnModel, {
    executionMode: 'sequential',
    graphOptimizationLevel: 'all',
    interOpNumThreads: 1,
  });
  return {
    readEndProbability: async (audio) => {
      const input = new Tensor('float32', buildLogMel(audio), [1, melBins, melFrames]);
      const output = await session.run({ input_features: input });
      const probability = output['logits']?.data[0];
      if (typeof probability !== 'number') {
        throw new TypeError('Smart Turn returned no probability');
      }
      return probability;
    },
  };
}
