import type {
  DrawImage,
  DrawReply,
  DrawRequest,
  ImageProvider,
  ImageSize,
} from '@heynixie/connectors';
import { parseJSONOrNull } from '@heynixie/wire';
import { geminiImagesSchema } from './gemini-images-schema';

export interface GeminiImagesOptions {
  readonly apiKey: string;

  // the API's base URL, such as https://generativelanguage.googleapis.com/v1beta
  readonly apiURL: string;
}

export function buildGeminiImages(options: GeminiImagesOptions): ImageProvider {
  return {
    takes: { source: true, references: true },
    draw: async (request) => {
      const reply = await readGeminiReply(options, request);

      return maskReply(reply, options.apiKey);
    },
  };
}

// The revision of the API that the request and the reply shapes below follow.
const apiRevision = '2026-05-20';

async function readGeminiReply(
  options: GeminiImagesOptions,
  request: DrawRequest,
): Promise<DrawReply> {
  // the key goes in a header, never in the URL, so no error text can quote it
  const response = await fetch(`${options.apiURL}/interactions`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': options.apiKey,
      'content-type': 'application/json',
      'api-revision': apiRevision,
    },
    body: JSON.stringify(buildInteraction(request)),
    signal: request.signal,
  }).catch((error: unknown) => error);

  if (!(response instanceof Response)) {
    // an abort is the call's own time limit, which the tool reads
    if (request.signal.aborted) {
      throw new Error('the draw passed its time limit');
    }

    return {
      kind: 'failed',
      reason: `Gemini could not be reached: ${String(response)}`,
      isBilled: false,
    };
  }

  const text = await response.text();

  return parseGeminiResponse(response.status, text);
}

const aspectRatios: Readonly<Record<ImageSize, string>> = {
  '1024x1024': '1:1',
  '1536x1024': '3:2',
  '1024x1536': '2:3',
};

// The prompt comes first, then the image to edit, then each reference.
function buildInteraction(request: DrawRequest) {
  const images = [...(request.source === undefined ? [] : [request.source]), ...request.references];

  return {
    model: request.model,
    input: [{ type: 'text', text: request.prompt }, ...images.map((image) => toImagePart(image))],
    response_format: {
      type: 'image',
      mime_type: 'image/png',
      aspect_ratio: aspectRatios[request.size],
      image_size: '1K',
    },
  };
}

function toImagePart(image: DrawImage) {
  return {
    type: 'image',
    mime_type: image.mediaType,
    data: Buffer.from(image.bytes).toString('base64'),
  };
}

function parseGeminiResponse(status: number, text: string): DrawReply {
  const body = parseJSONOrNull(text);

  if (status !== 200) {
    return parseGeminiError(status, body);
  }

  const parsed = geminiImagesSchema.interaction.safeParse(body);

  if (!parsed.success) {
    return {
      kind: 'failed',
      reason: 'Gemini answered with a reply nixie cannot read',
      isBilled: true,
    };
  }

  const blocks = parsed.data.steps
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? []);

  const encoded = blocks.find((block) => block.type === 'image' && block.data !== undefined)?.data;

  if (encoded !== undefined) {
    return { kind: 'image', mediaType: 'image/png', bytes: Buffer.from(encoded, 'base64') };
  }

  // The model answered in words and drew nothing, and the provider counts the call.
  const said = blocks.find((block) => block.type === 'text')?.text;

  return {
    kind: 'refused',
    reason: 'other',
    message: said ?? 'Gemini drew no image for this prompt.',
    isBilled: true,
  };
}

const blockedWords = /safety|blocked|prohibited|policy/iu;

function parseGeminiError(status: number, body: unknown): DrawReply {
  const parsed = geminiImagesSchema.error.safeParse(body);

  const message = parsed.success
    ? (parsed.data.error.message ?? 'no error detail')
    : 'no error detail';

  if (status === 400 && blockedWords.test(message)) {
    return { kind: 'refused', reason: 'safety', message, isBilled: false };
  }

  return {
    kind: 'failed',
    reason: `Gemini answered ${String(status)}: ${message}`,
    isBilled: false,
  };
}

const keyMask = '<the API key>';

function maskReply(reply: DrawReply, apiKey: string): DrawReply {
  if (reply.kind === 'refused') {
    return { ...reply, message: reply.message.replaceAll(apiKey, keyMask) };
  }

  return reply.kind === 'failed'
    ? { ...reply, reason: reply.reason.replaceAll(apiKey, keyMask) }
    : reply;
}
