import { store } from './store';

interface MomentListInput {
  readonly includeRetired: boolean;
  readonly query?: string | undefined;
}

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

  return {
    moments: moments.flatMap((moment) =>
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
    next: null,
  };
}
