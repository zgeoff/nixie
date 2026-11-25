import { parseMail } from '../parse/parse-mail';
import type { ReceivedMail } from '../store/write-received-mail';
import { writeReceivedMail } from '../store/write-received-mail';
import type { MemoryMail } from './build-memory-mail-host';
import type { TestMail } from './start-test-mail';

// Puts a mail in the host and stores it as the source would, with no arrival, so no rule sees it.
export function seedReceivedMail(
  mail: Pick<TestMail, 'host' | 'context'>,
  incoming: MemoryMail,
): Promise<ReceivedMail> {
  const hostMail = mail.host.deliver(incoming);

  return writeReceivedMail(mail.context, hostMail, parseMail(hostMail.raw));
}
