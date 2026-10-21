import { within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

export async function runMemoryForget(user: UserEvent, row: HTMLElement): Promise<void> {
  await user.click(within(row).getByRole('button', { name: 'Forget' }));

  await within(row).findByRole('list', { name: 'What the forget destroys' });

  await user.click(within(row).getByRole('button', { name: 'Forget for good' }));
}
