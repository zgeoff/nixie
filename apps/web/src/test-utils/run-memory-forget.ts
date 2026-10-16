import { within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

// Forgets an item from its row in the memory view as the user does: it opens the confirmation,
// waits for the preview to list what the forget destroys, and confirms.
export async function runMemoryForget(user: UserEvent, row: Readonly<HTMLElement>): Promise<void> {
  await user.click(within(row).getByRole('button', { name: 'Forget' }));

  await within(row).findByRole('list', { name: 'What the forget destroys' });

  await user.click(within(row).getByRole('button', { name: 'Forget for good' }));
}
