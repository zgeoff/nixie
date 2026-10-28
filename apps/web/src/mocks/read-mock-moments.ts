import { store } from './store';

interface MomentListInput {
  readonly includeRetired: boolean;
  readonly query?: string | undefined;
  readonly before?: number | undefined;
}

const pageSize = 50;

// The mock's cursor counts the moments of the pages before it, and the client treats it as opaque.
export function readMockMoments(input: MomentListInput) {
  const words = (input.query ?? '')
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '');

  const moments = store.moments
    .findMany((query) =>
      query.where(
        (moment) =>
          moment.state === 'active' || (input.includeRetired && moment.state === 'retired'),
      ),
    )
    .filter((moment) => {
      const text = [
        moment.title,
        moment.note?.text,
        ...moment.reflections.map((entry) => entry.text),
      ]
        .join('\n')
        .toLowerCase();

      return words.every((word) => text.includes(word));
    })
    .toSorted((left, right) => right.keptAt.getTime() - left.keptAt.getTime());

  const start = input.before ?? 0;
  const end = start + pageSize;

  return {
    moments: moments.slice(start, end).flatMap((moment) =>
      moment.state === 'destroyed'
        ? []
        : [
            {
              editedAt: moment.editedAt,
              keptAt: moment.keptAt,
              keptBy: moment.keptBy,
              momentID: moment.momentID,
              shortID: moment.shortID,
              state: moment.state,
              title: moment.title,
            },
          ],
    ),
    next: end < moments.length ? end : null,
  };
}
