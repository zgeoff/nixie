import { z } from 'zod';

export const driveListSchema = z.object({
  files: z.array(z.unknown()).exactOptional(),
  nextPageToken: z.string().exactOptional(),
});

// the fields to ask Drive for, which every file read and list names
export const driveFileFields =
  'id,name,mimeType,size,modifiedTime,shared,driveId,trashed,webViewLink,appProperties';

export const googleDocType = 'application/vnd.google-apps.document';
export const googleSheetType = 'application/vnd.google-apps.spreadsheet';
export const googleSlidesType = 'application/vnd.google-apps.presentation';

// shown when a search finds nothing, so the model can ask the owner to pick a file
export const searchScopeNote =
  'This searched only the files the owner picked for nixie and the files nixie made. When the ' +
  "file you want is missing, ask the owner to pick it on the connection's page in Settings.";
