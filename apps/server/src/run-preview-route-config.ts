import { cli } from 'gunshi';
import { previewRouteCommand } from './config/preview-route-command';

try {
  await cli(process.argv.slice(2), previewRouteCommand);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
