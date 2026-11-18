import { store } from '../mocks/store';

// Two code runs for the files page: the conversation's newer run wrote an image that it sent and a
// CSV file, and the task's older run wrote one CSV file. The newer run's result record exists, so a
// forget of it finds its target.
export async function seedCodeRunFiles(): Promise<void> {
  await store.tasks.create({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });

  await store.files.create({
    file: 'p3n8x2c7ke',
    name: 'revenue.png',
    mediaType: 'image/png',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    isSent: true,
    sequence: 20,
  });

  await store.files.create({
    file: 'k7w2m9qa4x',
    name: 'orders.csv',
    mediaType: 'text/csv',
    data: btoa('a,b\n'),
    sequence: 20,
    position: 1,
  });

  await store.files.create({
    file: 'h5d9v3ztr2',
    name: 'beds.csv',
    mediaType: 'text/csv',
    data: btoa('c\n'),
    sequence: 10,
    thread: 'k3vq8m2xpa',
  });

  await store.records.create({ kind: 'tool_result', sequence: 20, thread: 'conversation' });
}

// One code run of 35 CSV files, which fill a first page of 30 files and leave 5 for the second.
export async function seedCodeRunFilePages(): Promise<void> {
  for (let position = 0; position < 35; position += 1) {
    // oxlint-disable-next-line no-await-in-loop -- the rows keep their order
    await store.files.create({
      file: `f${String(position).padStart(9, '0')}`,
      name: `part-${String(position).padStart(2, '0')}.csv`,
      mediaType: 'text/csv',
      data: btoa('a\n'),
      sequence: 30,
      position,
    });
  }
}
