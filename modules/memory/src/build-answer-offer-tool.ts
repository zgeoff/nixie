import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import { buildWriteCaller } from './build-write-caller';
import type { ModelWriteStore } from './gate-types';
import { ImageOfferError } from './image-offer-error';
import type { ItemIDStore } from './types';

// Builds memory.answer_offer, which declares note and hands the owner's answer to an image offer
// to the store. Only a plain yes the owner typed saves the offered text; any other answer saves
// nothing and leaves no proposal.
export function buildAnswerOfferTool(
  memory: Pick<ModelWriteStore, 'writes'> & Pick<ItemIDStore, 'readShortIDs'>,
): ToolDefinition {
  return {
    name: 'memory.answer_offer',
    description: answerOfferDescription,
    input: answerOfferInput,
    output: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['applied', 'declined'] },
        itemID: { type: 'string' },
        version: { type: 'integer' },
      },
      required: ['status'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { status: 'owner_data', itemID: 'owner_data', version: 'owner_data' },
    },
    execution: 'direct',
    run: (call, context) => runAnswerCall(memory, call, context),
  };
}

const answerOfferDescription =
  "Passes on the owner's answer to your memory.offer_image offer, when their next message " +
  'answers it. Pass the image as you offered it, by its eventID and n, and answerEventID: the ' +
  "eventID of the owner's message that answers. You never pass the text: the offer holds it. " +
  'It saves the offered text only when that message is a plain typed yes; anything else, a no ' +
  'included, saves nothing and the result says declined. Call it for a no too, and say nothing ' +
  'more about the offer after a decline.';

const eventIDPattern = '^#?[1-9][0-9]{0,14}$';

const answerOfferInput = {
  type: 'object',
  properties: {
    eventID: {
      type: 'string',
      pattern: eventIDPattern,
      description: 'the eventID of the message that holds the image you offered',
    },
    image: { type: 'integer', minimum: 1, maximum: 100 },
    answerEventID: {
      type: 'string',
      pattern: eventIDPattern,
      description: "the eventID of the owner's message that answers the offer",
    },
  },
  required: ['eventID', 'image', 'answerEventID'],
  additionalProperties: false,
};

// An answer to no offer, or a message that is not the owner's answer, is the model's to read; any
// other failure propagates. An applied result names the item by its short ID.
async function runAnswerCall(
  memory: Pick<ModelWriteStore, 'writes'> & Pick<ItemIDStore, 'readShortIDs'>,
  call: ToolCall,
  context: ToolContext,
): Promise<ToolOutcome> {
  const input = answerArguments.parse(call.input);

  try {
    const outcome = await memory.writes.answerOffer({
      image: { messageSequence: toSequence(input.eventID), image: input.image },
      answerSequence: toSequence(input.answerEventID),
      caller: buildWriteCaller(context),
    });

    if (outcome.status === 'declined') {
      return { status: 'ok', result: outcome };
    }

    const shortIDs = await memory.readShortIDs([outcome.itemID]);

    return {
      status: 'ok',
      result: { ...outcome, itemID: shortIDs.get(outcome.itemID) ?? outcome.itemID },
    };
  } catch (error) {
    if (error instanceof ImageOfferError) {
      return { status: 'error', message: error.message };
    }

    throw error;
  }
}

const answerArguments = z.object({
  eventID: z.string(),
  image: z.int(),
  answerEventID: z.string(),
});

function toSequence(eventID: string): number {
  return Number(eventID.replace(/^#/u, ''));
}
