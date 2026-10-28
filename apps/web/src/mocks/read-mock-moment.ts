import { store } from './store';

export function readMockMoment(momentID: string) {
  const moment = store.moments.findFirst((query) =>
    query.where((candidate) => candidate.momentID === momentID || candidate.shortID === momentID),
  );

  if (moment === undefined || moment.state === 'destroyed') {
    return null;
  }

  return {
    editedAt: moment.editedAt,
    firstSequence: moment.firstSequence,
    keptAt: moment.keptAt,
    keptBy: moment.keptBy,
    lastSequence: moment.lastSequence,
    links: moment.linkedItemIDs.flatMap((itemID) => readLink(itemID)),
    momentID: moment.momentID,
    note: moment.note,
    reflections: moment.reflections,
    shortID: moment.shortID,
    state: moment.state,
    thread: moment.thread,
    title: moment.title,
    titleBy: moment.titleBy,
    version: moment.version,
  };
}

function readLink(itemID: string) {
  const item = store.memoryItems.findFirst((query) => query.where({ itemID }));
  const latest = item?.versions.at(-1);

  if (item === undefined || latest === undefined) {
    return [];
  }

  return [{ itemID, shortID: item.shortID, text: latest.isUnreadable ? null : latest.text }];
}
