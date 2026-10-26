import { momentLinkedCodec } from './moment-linked-codec';
import type { LinkMomentRequest, MomentContext, MomentTables, MomentWrite } from './moment-types';
import type { MemoryTables } from './types';
import { writeMomentChange } from './write-moment-change';

// The request names the item by its UUID, which the caller resolves from a short ID first.
export function writeMomentLink(
  context: MomentContext,
  request: LinkMomentRequest,
): Promise<MomentWrite> {
  return writeMomentChange(context, request, async (state) => {
    const item = await state.tx
      .$extendTables<MemoryTables>()
      .selectFrom('memory_items')
      .select('state')
      .where('item_id', '=', request.itemID)
      .executeTakeFirst();

    if (item === undefined || (item.state !== 'active' && item.state !== 'retired')) {
      return 'item_not_found';
    }

    const link = await state.tx
      .$extendTables<MomentTables>()
      .selectFrom('moment_links')
      .select('link_key')
      .where('moment_id', '=', state.row.moment_id)
      .where('item_id', '=', request.itemID)
      .executeTakeFirst();

    if (request.isLinked && link !== undefined) {
      return 'already_linked';
    }

    if (!request.isLinked && link === undefined) {
      return 'not_linked';
    }

    return {
      kind: 'moment_linked',
      payload: momentLinkedCodec.encode({
        momentID: state.row.moment_id,
        version: state.nextVersion,
        itemID: request.itemID,
        isLinked: request.isLinked,
      }),
    };
  });
}
