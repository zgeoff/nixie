import { createShortID } from '@heynixie/db';
import type { ToolDefinition, ToolOutcome, ToolRun } from '@heynixie/tools';
import { ToolResultRefusedError } from '@heynixie/tools';
import type { DrawReply, ImageProvider } from '../types';
import { getPageSession } from '../utils/get-page-session';
import { probeSessionEnded } from '../web/probe-session-ended';
import { buildImageOutput } from './build-image-output';
import { convertToPng } from './convert-to-png';
import { drawArguments } from './draw-arguments';
import { imageLimits } from './image-limits';
import { formatImageSize, imageSizes } from './image-size';
import type { ImageSize } from './image-size';
import type { ImageTables } from './image-tables';
import { noteDeclaration } from './note-declaration';
import { padPng } from './pad-png';
import { pickImageProfile } from './pick-image-profile';
import type { PickedProfile } from './pick-image-profile';
import { pickRoomLeft } from './pick-room-left';
import { readDrawSources } from './read-draw-sources';
import type { DrawSources } from './read-draw-sources';
import { readPhotoImageIDs } from './read-photo-image-ids';
import { refuseImage } from './refuse-image';
import { showImage } from './show-image';
import type { ImageToolOptions } from './types';

const drawInput = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      minLength: 1,
      maxLength: imageLimits.maxPromptLength,
      description: 'what to draw, or with `from`, the one change to make',
    },
    size: {
      type: 'string',
      enum: [...imageSizes],
      description: 'the size of a new image; 1024x1024 when left out',
    },
    from: {
      type: 'string',
      minLength: 1,
      description: 'the image to edit; the edit comes back at its size',
    },
    profile: {
      type: 'string',
      minLength: 1,
      description: 'a key of the configured profiles; the default profile when left out',
    },
    references: {
      type: 'array',
      maxItems: imageLimits.maxReferences,
      items: { type: 'string', minLength: 1 },
      description:
        'up to 4 image IDs the provider sees beside the prompt, so a subject stays the same',
    },
  },
  required: ['prompt'],
  additionalProperties: false,
  not: { required: ['from', 'size'] },
};

const drawOutput = buildImageOutput([
  'image',
  'from',
  'profile',
  'size',
  'isShown',
  'roomLeft',
  'prompt',
  'refused',
  'profiles',
]);

const drawDescription =
  'Draws a picture from a prompt, or with `from` edits an image you drew or imported, one change ' +
  'at a time. nixie keeps every picture it gets back and sends the stored bytes with each edit, ' +
  'so name the image to edit in `from`. `references` are up to 4 image IDs that the provider ' +
  'sees beside the prompt, so a subject stays the same. The picture shows beside the result. A ' +
  'call is paid. A provider can refuse a prompt: the refusal lists the other profiles, and you ' +
  'choose whether to retry on one. A draw that names a photo of the owner is sent to the ' +
  'provider only when the owner allows it.';

export function buildImageDrawTool(options: ImageToolOptions): ToolDefinition {
  return {
    name: 'image.draw',
    description: drawDescription,
    input: drawInput,
    output: drawOutput.output,
    declaration: { ...noteDeclaration, effects: ['fetch'], results: drawOutput.results },
    execution: 'direct',
    paid: {
      priceMicros: async (input) => {
        const sources = await readDrawSources(options, drawArguments.parse(input));

        return sources.kind === 'ready' ? sources.priceMicros : 1;
      },
      check: async (input, context) => {
        const sources = await readDrawSources(options, drawArguments.parse(input));

        return sources.kind === 'refused'
          ? sources.refusal
          : holdRoomOrRefuse(context.run, context.callID);
      },
      release: (context) => {
        context.run.session?.releaseImageRoom?.(context.callID);
      },
    },
    prepare: (input) => prepareDraw(options, input),
    run: async (call, context) => {
      try {
        const sources = await readDrawSources(options, drawArguments.parse(call.input));

        return sources.kind === 'refused'
          ? { status: 'ok', ...sources.refusal }
          : await runDraw(options, sources, { run: context.run, callID: call.callID });
      } finally {
        context.run.session?.releaseImageRoom?.(call.callID);
      }
    },
  };
}

// Takes the room for the picture now, so a draw beside this one cannot pass on the same room. The
// hold lasts until the call reserves its picture or ends.
function holdRoomOrRefuse(run: ToolRun, callID: string) {
  if (run.session?.holdImageRoom?.(callID) === true) {
    return null;
  }

  return refuseImage(
    'IMAGE_CAPS_FULL',
    'This session holds as many images as it can take, so nothing was drawn or charged. The next ' +
      'turn opens a rebuilt session, where earlier pictures show as markers and image.read ' +
      'brings any one back.',
    { rest: { roomLeft: 0 } },
  );
}

// A draw that names a photo is a send to the provider, and a rule can allow it.
async function prepareDraw(options: ImageToolOptions, input: unknown) {
  const args = drawArguments.safeParse(input);

  if (!args.success) {
    return { destinations: [] };
  }

  const picked = pickImageProfile(options, args.data.profile);
  const named = args.data.from === undefined ? [] : [args.data.from];

  const hasPhoto = await probeHasPhoto(options, [...named, ...args.data.references]);

  if (picked === null || !hasPhoto) {
    return { destinations: [] };
  }

  return { destinations: [picked.profile.provider], effects: ['fetch', 'send'] as const };
}

async function probeHasPhoto(options: ImageToolOptions, ids: readonly string[]): Promise<boolean> {
  const photos = await readPhotoImageIDs(options.log, ids);

  return photos.length > 0;
}

interface DrawCall {
  readonly run: ToolRun;
  readonly callID: string;
}

async function runDraw(
  options: ImageToolOptions,
  sources: Extract<DrawSources, { kind: 'ready' }>,
  call: DrawCall,
): Promise<ToolOutcome> {
  const source = await readDrawSource(sources);

  const signal = AbortSignal.timeout(options.drawTimeoutMs ?? imageLimits.drawTimeoutMs);

  const references = sources.references.map((reference) => ({
    mediaType: 'image/png',
    bytes: reference.bytes,
  }));

  const sourceFields = source === null ? {} : { source };

  const reply = await callProvider(sources.picked, signal, {
    model: sources.picked.profile.model,
    prompt: sources.args.prompt,
    size: sources.size,
    ...sourceFields,
    references,
    signal,
  });

  if (reply.kind !== 'image') {
    return { status: 'ok', ...refuseReply(options, sources, reply) };
  }

  return writeDraw(options, sources, { ...call, reply });
}

async function readDrawSource(sources: Extract<DrawSources, { kind: 'ready' }>) {
  if (sources.source === null) {
    return null;
  }

  const padded = sources.isSizeNative
    ? null
    : await padPng(sources.source.bytes, parseDimensions(sources.size));

  const bytes = padded ?? sources.source.bytes;

  return { mediaType: 'image/png', bytes };
}

function parseDimensions(size: ImageSize) {
  const [width = 0, height = 0] = size.split('x').map(Number);

  return { width, height };
}

type CalledReply = DrawReply | { readonly kind: 'timeout' } | { readonly kind: 'threw' };

async function callProvider(
  picked: PickedProfile,
  signal: AbortSignal,
  request: Parameters<ImageProvider['draw']>[0],
): Promise<CalledReply> {
  try {
    return await picked.provider.draw(request);
  } catch {
    // the error's text can quote the request, so it is never kept
    return signal.aborted ? { kind: 'timeout' } : { kind: 'threw' };
  }
}

function refuseReply(
  options: ImageToolOptions,
  sources: Extract<DrawSources, { kind: 'ready' }>,
  reply: Exclude<CalledReply, { kind: 'image' }>,
) {
  if (reply.kind === 'refused') {
    const others = Object.keys(options.images.profiles).filter((key) => key !== sources.picked.key);

    return {
      ...refuseImage('IMAGE_REFUSED', reply.message, {
        refused: { profile: sources.picked.key, reason: reply.reason },
        rest: { profiles: others },
      }),
      ...(reply.isBilled ? { billed: true as const } : {}),
    };
  }

  if (reply.kind === 'failed') {
    return {
      ...refuseImage('IMAGE_FAILED', `The provider failed: ${reply.reason}`),
      ...(reply.isBilled ? { billed: true as const } : {}),
    };
  }

  // The call may have drawn the image before the time ran out, or the reply threw after it was
  // billed, so the charge stands.
  const refusal =
    reply.kind === 'timeout'
      ? refuseImage(
          'IMAGE_TIMEOUT',
          'The provider gave no reply in time. The image may exist at the provider, and the call was charged.',
        )
      : refuseImage('IMAGE_FAILED', 'The provider call failed, and the call was charged.');

  return { ...refusal, billed: true as const };
}

interface StoredDraw extends DrawCall {
  readonly reply: Extract<DrawReply, { kind: 'image' }>;
}

async function writeDraw(
  options: ImageToolOptions,
  sources: Extract<DrawSources, { kind: 'ready' }>,
  drawn: StoredDraw,
): Promise<ToolOutcome> {
  if (drawn.reply.bytes.byteLength > imageLimits.maxStoredBytes) {
    return { status: 'ok', ...refuseOverSize(), billed: true };
  }

  const png = await convertToPng(drawn.reply.bytes, { longEdge: null });

  if (png.kind === 'unreadable') {
    return {
      status: 'ok',
      ...refuseImage('IMAGE_FAILED', `The reply is no picture that decodes: ${png.reason}`),
      billed: true,
    };
  }

  const image = createShortID();
  const uuid = crypto.randomUUID();

  // the hold gives its room back in the step that reserves the picture, so the picture takes it
  const shown = await showImage(drawn.run, png.bytes, options.imageLongEdge, drawn.callID);

  const size = formatImageSize(png);
  const roomLeft = pickRoomLeft(drawn.run.session?.readImageRoom?.());
  const from = sources.sourceRow?.image_id ?? null;

  const result = {
    image,
    from,
    profile: sources.picked.key,
    size,
    isShown: shown.image !== null,
    roomLeft,
  };

  return {
    status: 'ok',
    result,
    record: {
      ...result,
      prompt: sources.args.prompt,
      references: sources.references.map((reference) => reference.row.image_id),
    },
    images: shown.image === null ? [] : [shown.image],
    attachments: [png.bytes],
    hidden: {
      costUSD: sources.priceMicros / 1_000_000,
      model: sources.picked.profile.model,
      uuids: { [image]: uuid },
    },
    writeBeside: async (tx, resultSequence) => {
      const hasEnded = await probeSessionEnded(tx, getPageSession(drawn.run));

      if (hasEnded) {
        throw new ToolResultRefusedError(
          'the session ended while the image was drawn, so the call keeps no image',
        );
      }

      await tx
        .$extendTables<ImageTables>()
        .insertInto('images')
        .values({
          image_id: image,
          uuid,
          sequence: resultSequence,
          position: 0,
          parent_id: from,
          source: 'draw',
          source_seq: null,
          is_pinned: 0,
          profile: sources.picked.key,
          model: sources.picked.profile.model,
          media_type: 'image/png',
          size,
          byte_count: png.bytes.byteLength,
          created_at: options.clock.now(),
        })
        .execute();
    },
  };
}

function refuseOverSize() {
  return refuseImage('IMAGE_FAILED', 'The reply is longer than the 8 MiB that nixie stores.');
}
