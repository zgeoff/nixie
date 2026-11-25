import type {
  DrawImage,
  DrawReply,
  DrawRequest,
  ImageProvider,
  ProviderFetch,
} from '@heynixie/connectors';
import { CredentialRefusalError } from '@heynixie/egress';
import { parseJSONOrNull } from '@heynixie/wire';
import { openaiImagesSchema } from './openai-images-schema';

export interface OpenAIImagesOptions {
  // adds the API key on the host, so the adapter holds none
  readonly fetch: ProviderFetch;

  // the API's base URL, such as https://api.openai.com/v1
  readonly apiURL: string;
}

export function buildOpenAIImages(options: OpenAIImagesOptions): ImageProvider {
  return {
    takes: { source: true, references: true },
    draw: (request) => readOpenAIReply(options, request),
  };
}

async function readOpenAIReply(
  options: OpenAIImagesOptions,
  request: DrawRequest,
): Promise<DrawReply> {
  const hasImages = request.source !== undefined || request.references.length > 0;
  const endpoint = hasImages ? 'edits' : 'generations';

  const response = await options
    .fetch(`${options.apiURL}/images/${endpoint}`, {
      method: 'POST',
      headers: hasImages ? {} : { 'content-type': 'application/json' },
      body: hasImages ? buildEditForm(request) : JSON.stringify(buildGenerationBody(request)),
      signal: request.signal,
    })
    .catch((error: unknown) => error);

  if (response instanceof CredentialRefusalError) {
    throw response;
  }

  if (!(response instanceof Response)) {
    // an abort is the call's own time limit, which the tool reads
    if (request.signal.aborted) {
      throw new Error('the draw passed its time limit');
    }

    return {
      kind: 'failed',
      reason: `OpenAI could not be reached: ${String(response)}`,
      isBilled: false,
    };
  }

  const text = await response.text();

  return parseOpenAIResponse(response.status, text);
}

// The source comes first, so the provider edits it, and each reference follows.
function buildEditForm(request: DrawRequest): FormData {
  const form = new FormData();

  form.set('model', request.model);
  form.set('prompt', request.prompt);
  form.set('size', request.size);
  form.set('n', '1');

  const source = request.source === undefined ? [] : [request.source];

  for (const [index, image] of [...source, ...request.references].entries()) {
    form.append('image[]', toBlob(image), `image-${String(index + 1)}.png`);
  }

  return form;
}

function toBlob(image: DrawImage): Blob {
  return new Blob([image.bytes], { type: image.mediaType });
}

function buildGenerationBody(request: DrawRequest) {
  // oxlint-disable-next-line eslint/id-length -- the images API names its image count n
  return { model: request.model, prompt: request.prompt, size: request.size, n: 1 };
}

function parseOpenAIResponse(status: number, text: string): DrawReply {
  const body = parseJSONOrNull(text);

  if (status !== 200) {
    return parseOpenAIError(status, body);
  }

  const parsed = openaiImagesSchema.response.safeParse(body);
  const encoded = parsed.success ? parsed.data.data[0]?.b64_json : undefined;

  if (encoded === undefined) {
    // the call was answered, so it may have been billed
    return {
      kind: 'failed',
      reason: 'OpenAI answered with no image nixie can read',
      isBilled: true,
    };
  }

  return { kind: 'image', mediaType: 'image/png', bytes: Buffer.from(encoded, 'base64') };
}

function parseOpenAIError(status: number, body: unknown): DrawReply {
  const parsed = openaiImagesSchema.error.safeParse(body);
  const error = parsed.success ? parsed.data.error : undefined;
  const message = error?.message ?? 'no error detail';

  if (error?.code === 'moderation_blocked') {
    return {
      kind: 'refused',
      reason: 'safety',
      message,

      // a block of the output came after the image was drawn
      isBilled: error.moderation_details?.moderation_stage === 'output',
    };
  }

  return {
    kind: 'failed',
    reason: `OpenAI answered ${String(status)}: ${message}`,
    isBilled: false,
  };
}
