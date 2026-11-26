import type { ConnectorAction, Reconcile } from '../../types';
import type { GoogleDeps } from '../types';
import { buildDriveChangeTool } from './build-drive-change-tool';
import { buildDriveCreateTool } from './build-drive-create-tool';
import { buildDriveReadTool } from './build-drive-read-tool';
import { buildDriveSearchTool } from './build-drive-search-tool';
import { checkDriveChange } from './check-drive-change';
import { driveCheckName, driveScope } from './drive-tool-names';
import { runDriveChange } from './run-drive-change';
import { runDriveCreate } from './run-drive-create';

// A write is checked no sooner than 5 minutes after its attempt began. A write that the check does
// not find tries again, because a Drive write reaches no one else.
const writeReconcile: Reconcile = {
  kind: 'check',
  tool: driveCheckName,
  trustNegativeAfterMs: 300_000,
  onNotFound: 'retry',
};

// The Drive tools as actions of the Google connector, each needing the scope drive.file. The search
// and the read run in the turn; the create and the change run queued.
export function buildDriveActions(deps: GoogleDeps): ConnectorAction[] {
  const reads = [buildDriveSearchTool(deps), buildDriveReadTool(deps)].map(
    (tool): ConnectorAction => ({
      tool,
      scopes: [driveScope],
      reconcile: { kind: 'none' },
    }),
  );

  return [
    ...reads,
    {
      tool: buildDriveCreateTool(deps),
      scopes: [driveScope],
      reconcile: writeReconcile,
      queued: {
        reconcile: writeReconcile,
        run: (attempt) => runDriveCreate(deps, attempt),
        check: (attempt) => checkDriveChange(deps, attempt),
      },
    },
    {
      tool: buildDriveChangeTool(deps),
      scopes: [driveScope],
      reconcile: writeReconcile,
      queued: {
        reconcile: writeReconcile,
        run: (attempt) => runDriveChange(deps, attempt),
        check: (attempt) => checkDriveChange(deps, attempt),
      },
    },
  ];
}
