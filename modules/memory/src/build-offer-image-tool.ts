import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import { buildWriteCaller } from './build-write-caller';
import type { ModelWriteStore } from './gate-types';
import { ImageOfferError } from './image-offer-error';
import { makeInputRecorder } from './make-input-recorder';

// Builds memory.offer_image, which declares note and records the model's one offer to remember
// what an image of the owner's shows. It saves nothing: the offered text waits for the owner's
// typed yes, which memory.answer_offer reads.
export function buildOfferImageTool(memory: Pick<ModelWriteStore, 'writes'>): ToolDefinition {
  return {
    name: 'memory.offer_image',
    description: offerImageDescription,
    input: offerImageInput,
    output: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['offered'] },
        line: { type: 'string' },
      },
      required: ['status', 'line'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['text'],
      results: { status: 'owner_data', line: 'owner_data' },
    },
    execution: 'direct',

    // the offer's record seals the text under its own key, so the call's record leaves it out
    recordInput: makeInputRecorder(['text']),
    run: (call, context) => runOfferCall(memory, call, context),
  };
}

const offerImageDescription =
  "Offers to remember what an image the owner attached shows. Use it when the owner's image " +
  'holds something about them or their life worth keeping, such as a place, a pet, a plan or a ' +
  'thing they own, and they did not ask you to remember it. Pass the eventID of the message ' +
  'that holds the image, its n from the <dropped-image> marker, and text: the one plain factual ' +
  'sentence you would save, naming the owner as a memory does. Then say the line the result ' +
  'gives, word for word, as its own line of your reply. Nothing is saved until the owner ' +
  'answers with a typed yes, which memory.answer_offer reads. An image takes one offer: a second ' +
  'for the same image is refused, so never offer again after a no or no answer.';

const offerImageInput = {
  type: 'object',
  properties: {
    eventID: {
      type: 'string',
      pattern: '^#?[1-9][0-9]{0,14}$',
      description: 'the eventID of the message that holds the image, as its stamp shows it',
    },
    image: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      description: 'the n of the image in that message, from its <dropped-image> marker',
    },
    text: { type: 'string', minLength: 1, maxLength: 500, pattern: '^[^\\r\\n]*$' },
  },
  required: ['eventID', 'image', 'text'],
  additionalProperties: false,
};

// A second offer for one image, or an image that is no image of the owner's, is the model's to
// read; any other failure propagates.
async function runOfferCall(
  memory: Pick<ModelWriteStore, 'writes'>,
  call: ToolCall,
  context: ToolContext,
): Promise<ToolOutcome> {
  const input = offerArguments.parse(call.input);

  try {
    const line = await memory.writes.offerImage({
      image: {
        messageSequence: Number(input.eventID.replace(/^#/u, '')),
        image: input.image,
      },
      text: input.text,
      caller: buildWriteCaller(context),
    });

    // the line repeats the offered text, which a saved offer's item key guards, so the call's
    // record leaves it out
    return { status: 'ok', result: { status: 'offered', line }, record: { status: 'offered' } };
  } catch (error) {
    if (error instanceof ImageOfferError) {
      return { status: 'error', message: error.message };
    }

    throw error;
  }
}

const offerArguments = z.object({ eventID: z.string(), image: z.int(), text: z.string() });
