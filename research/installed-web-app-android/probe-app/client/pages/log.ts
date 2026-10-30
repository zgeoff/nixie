import { startPage } from './start-page.ts';

const page = await startPage();

page.pollLog(['subscribed', 'push-sent', 'push-received', 'approve', 'share', 'sync']);
