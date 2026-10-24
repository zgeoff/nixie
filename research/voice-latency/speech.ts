// The on-host speech candidates: 3 speech-to-text models, 2 text-to-speech voices, the caller's
// voice, and Silero voice activity detection, all through sherpa-onnx.
import { join } from 'node:path';
// @ts-expect-error sherpa-onnx-node ships no type declarations for its entry point.
import sherpa from 'sherpa-onnx-node';

export interface Recognizer {
  // Feeds 16 kHz audio as it arrives. The batch models keep it until the end of speech.
  accept: (samples: Float32Array) => void;
  // Returns the transcript once the end of speech is known.
  finish: () => Promise<string>;
}

export interface SpeechToText {
  name: SpeechToTextName;
  start: () => Recognizer;
}

export interface Synthesized {
  firstChunkMs: number;
  samples: Float32Array;
  sampleRate: number;
  totalMs: number;
}

export interface TextToSpeech {
  name: TextToSpeechName;
  sampleRate: number;
  speak: (text: string) => Promise<Synthesized>;
}

export type SpeechToTextName = 'moonshine' | 'whisper' | 'zipformer';
export type TextToSpeechName = 'kokoro' | 'kokoro-int8' | 'piper';

export const sampleRate = 16_000;
export const threads = Number(process.env.SPEECH_THREADS ?? 2);
export const modelsDir = join(import.meta.dir, 'models');

const zipformerDir = join(modelsDir, 'sherpa-onnx-streaming-zipformer-en-2023-06-26');
const zipformerSuffix = 'epoch-99-avg-1-chunk-16-left-128.int8.onnx';
const moonshineDir = join(modelsDir, 'sherpa-onnx-moonshine-base-en-int8');
const whisperDir = join(modelsDir, 'sherpa-onnx-whisper-base.en');

export function createSpeechToText(name: SpeechToTextName): SpeechToText {
  return name === 'zipformer' ? createZipformer() : createBatchRecognizer(name);
}

// A streaming transducer: it decodes while the caller speaks, so little is left at the end.
function createZipformer(): SpeechToText {
  const recognizer = new sherpa.OnlineRecognizer({
    decodingMethod: 'greedy_search',
    featConfig: { featureDim: 80, sampleRate },
    modelConfig: {
      numThreads: threads,
      tokens: join(zipformerDir, 'tokens.txt'),
      transducer: {
        decoder: join(zipformerDir, `decoder-${zipformerSuffix}`),
        encoder: join(zipformerDir, `encoder-${zipformerSuffix}`),
        joiner: join(zipformerDir, `joiner-${zipformerSuffix}`),
      },
    },
  });
  return {
    name: 'zipformer',
    start: () => {
      const stream = recognizer.createStream();
      function drainReady(): void {
        while (recognizer.isReady(stream)) {
          recognizer.decode(stream);
        }
      }
      return {
        accept: (samples) => {
          stream.acceptWaveform({ sampleRate, samples });
          drainReady();
        },
        finish: () => {
          // 0.3 s of tail padding flushes the last frames through the model's right context.
          stream.acceptWaveform({ sampleRate, samples: new Float32Array(sampleRate * 0.3) });
          stream.inputFinished();
          drainReady();
          return Promise.resolve(recognizer.getResult(stream).text.trim().toLowerCase());
        },
      };
    },
  };
}

// Moonshine and Whisper read the whole utterance once the end of speech is known.
function createBatchRecognizer(name: 'moonshine' | 'whisper'): SpeechToText {
  const recognizer = new sherpa.OfflineRecognizer({
    featConfig: { featureDim: 80, sampleRate },
    modelConfig: { numThreads: threads, ...buildBatchModel(name) },
  });
  return {
    name,
    start: () => {
      const parts: Float32Array[] = [];
      return {
        accept: (samples) => {
          parts.push(samples);
        },
        finish: async () => {
          const stream = recognizer.createStream();
          stream.acceptWaveform({ sampleRate, samples: mergeSamples(parts) });
          await recognizer.decodeAsync(stream);
          return recognizer.getResult(stream).text.trim().toLowerCase();
        },
      };
    },
  };
}

function buildBatchModel(name: 'moonshine' | 'whisper'): Record<string, unknown> {
  if (name === 'moonshine') {
    return {
      moonshine: {
        cachedDecoder: join(moonshineDir, 'cached_decode.int8.onnx'),
        encoder: join(moonshineDir, 'encode.int8.onnx'),
        preprocessor: join(moonshineDir, 'preprocess.onnx'),
        uncachedDecoder: join(moonshineDir, 'uncached_decode.int8.onnx'),
      },
      tokens: join(moonshineDir, 'tokens.txt'),
    };
  }
  return {
    tokens: join(whisperDir, 'base.en-tokens.txt'),
    whisper: {
      decoder: join(whisperDir, 'base.en-decoder.int8.onnx'),
      encoder: join(whisperDir, 'base.en-encoder.int8.onnx'),
      language: 'en',
      task: 'transcribe',
    },
  };
}

export function mergeSamples(parts: Float32Array[]): Float32Array {
  const merged = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

// A sentence longer than any reply sentence. Piper ran up to 14 times slower than usual on the
// first sentence longer than any it had spoken before in the process, so a runner speaks this first.
export const longWarmUp = [
  'Before a long walk, pack water, a warm layer, a rain jacket, a map, a torch, spare batteries,',
  'a small first aid kit, sun cream, snacks for the afternoon, and a charged phone,',
  'then tell a friend where you plan to go and when you expect to be back home again.',
].join(' ');

// Piper's lessac voice and Kokoro's voice 3, in full precision or int8, speak nixie's replies. Piper's ryan voice is the
// caller, so the caller never shares a voice with nixie.
export function createTextToSpeech(name: TextToSpeechName | 'caller'): TextToSpeech {
  const tts = new sherpa.OfflineTts({
    maxNumSentences: 1,
    model: { debug: false, numThreads: threads, provider: 'cpu', ...buildVoice(name) },
  });
  return {
    name: name === 'caller' ? 'piper' : name,
    sampleRate: tts.sampleRate,
    speak: async (text) => {
      const startedAt = performance.now();
      let firstChunkAt: number | undefined;
      const audio = await tts.generateAsync({
        onProgress: () => {
          firstChunkAt ??= performance.now();
          return 1;
        },
        sid: name.startsWith('kokoro') ? 3 : 0,
        speed: 1,
        text,
      });
      const doneAt = performance.now();
      return {
        firstChunkMs: (firstChunkAt ?? doneAt) - startedAt,
        sampleRate: audio.sampleRate,
        samples: audio.samples,
        totalMs: doneAt - startedAt,
      };
    },
  };
}

function buildVoice(name: TextToSpeechName | 'caller'): Record<string, unknown> {
  if (name === 'kokoro' || name === 'kokoro-int8') {
    const dir = join(modelsDir, name === 'kokoro' ? 'kokoro-en-v0_19' : 'kokoro-int8-en-v0_19');
    return {
      kokoro: {
        dataDir: join(dir, 'espeak-ng-data'),
        model: join(dir, name === 'kokoro' ? 'model.onnx' : 'model.int8.onnx'),
        tokens: join(dir, 'tokens.txt'),
        voices: join(dir, 'voices.bin'),
      },
    };
  }
  const voice = name === 'caller' ? 'en_US-ryan-medium' : 'en_US-lessac-medium';
  const dir = join(modelsDir, `vits-piper-${voice}`);
  return {
    vits: {
      dataDir: join(dir, 'espeak-ng-data'),
      model: join(dir, `${voice}.onnx`),
      tokens: join(dir, 'tokens.txt'),
    },
  };
}

// Silero VAD in 32 ms windows. silenceMs is how long a pause must last before the turn ends.
export function createVad(silenceMs: number): {
  accept: (samples: Float32Array) => void;
  isSpeaking: () => boolean;
  clearSegments: () => void;
  hasSegment: () => boolean;
  readSegments: () => { end: number; start: number }[];
  reset: () => void;
} {
  const vad = new sherpa.Vad(
    {
      numThreads: 1,
      sampleRate,
      sileroVad: {
        maxSpeechDuration: 20,
        minSilenceDuration: silenceMs / 1000,
        minSpeechDuration: 0.2,
        model: join(modelsDir, 'silero_vad.onnx'),
        threshold: 0.5,
        windowSize: 512,
      },
    },
    30,
  );
  return {
    accept: (samples) => {
      vad.acceptWaveform(samples);
    },
    clearSegments: () => {
      while (!vad.isEmpty()) {
        vad.pop();
      }
    },
    hasSegment: () => !vad.isEmpty(),
    isSpeaking: () => vad.isDetected(),
    // Each closed segment as sample offsets since the last reset.
    readSegments: () => {
      const segments: { end: number; start: number }[] = [];
      while (!vad.isEmpty()) {
        const segment: { samples: Float32Array; start: number } = vad.front(false);
        segments.push({ end: segment.start + segment.samples.length, start: segment.start });
        vad.pop();
      }
      return segments;
    },
    reset: () => {
      vad.reset();
    },
  };
}

// Resamples to 16 kHz by linear interpolation, enough for the caller's synthetic speech.
export function toSampleRate(samples: Float32Array, from: number): Float32Array {
  if (from === sampleRate) {
    return samples;
  }
  const out = new Float32Array(Math.floor((samples.length * sampleRate) / from));
  const step = from / sampleRate;
  for (let i = 0; i < out.length; i++) {
    const at = i * step;
    const low = Math.floor(at);
    const frac = at - low;
    out[i] = (samples[low] ?? 0) * (1 - frac) + (samples[low + 1] ?? 0) * frac;
  }
  return out;
}
