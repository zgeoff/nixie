import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import { css } from '../styled-system/css';
import type { ListedConnection } from '../types';
import { useNixieClient } from '../utils/use-nixie-client';
import { openGooglePicker } from './open-google-picker';
import { pickDriveToken } from './pick-drive-token';
import { loadPickerSignIn, requestPickerToken } from './request-picker-token';

export interface DrivePickerProps {
  readonly connection: ListedConnection;
}

interface PickerChoice {
  readonly clientID: string;
  readonly pickerKey: string;
  readonly projectNumber: string;
}

const driveScope = 'drive.file';
const link = css({ color: 'link', textDecoration: 'underline' });

// Lets you choose the Drive files that nixie may see. The sign-in and the picker run in the browser
// on a token of its own, which holds `drive.file` alone and goes nowhere else. The page sends nixie
// only the IDs that you picked, and nixie answers with the ones it can read.
export function DrivePicker(props: DrivePickerProps): ReactNode {
  const nixie = useNixieClient();
  const isHydrated = useIsHydrated();

  const setup = useQuery({
    ...nixie.queryUtils.connections.readSetup.queryOptions({
      input: {
        connector: 'google',
        origin: isHydrated ? globalThis.location.origin : 'https://nixie.invalid',
      },
    }),
    enabled: isHydrated,
  });

  const isDriveGranted = !props.connection.missing.some((missing) => missing.scope === driveScope);

  const signIn = useQuery({
    queryKey: ['google-picker-sign-in'],
    queryFn: async () => {
      await loadPickerSignIn();

      return true;
    },
    enabled: isHydrated && isDriveGranted,
    retry: false,
    staleTime: Infinity,
  });

  const choose = useMutation({
    mutationFn: async (picker: PickerChoice) => {
      const answer = await requestPickerToken({
        clientID: picker.clientID,
        account: props.connection.account ?? '',
      });

      const token = pickDriveToken(answer);

      if (token.kind === 'refused') {
        throw new Error(token.message);
      }

      const files = await openGooglePicker({
        token: token.token,
        pickerKey: picker.pickerKey,
        projectNumber: picker.projectNumber,
      });

      if (files.length === 0) {
        return [];
      }

      return nixie.client.connections.checkPicked({
        connection: props.connection.connection,
        files,
      });
    },
  });

  if (props.connection.status !== 'active' || !isDriveGranted) {
    return null;
  }

  const client = setup.data?.client ?? null;

  if (!setup.isSuccess) {
    return null;
  }

  if (client === null || client.pickerKey === null || client.projectNumber === null) {
    return (
      <section aria-label="Drive files">
        <p>
          To choose Drive files, add a picker key and a project number to the client on the{' '}
          <Link className={link} to="/settings/connections">
            connections page
          </Link>
          .
        </p>
      </section>
    );
  }

  const pickerKey = client.pickerKey;
  const projectNumber = client.projectNumber;

  return (
    <section aria-label="Drive files">
      <p>nixie sees only the Drive files that you choose here and the files it makes.</p>
      <button
        disabled={!isHydrated || !signIn.isSuccess || choose.isPending}
        onClick={() => {
          choose.mutate({ clientID: client.clientID, pickerKey, projectNumber });
        }}
        type="button"
      >
        Choose Drive files
      </button>
      {signIn.isError ? <p role="alert">{signIn.error.message}</p> : null}
      {choose.isError ? <p role="alert">{choose.error.message}</p> : null}
      {choose.isSuccess && choose.data.length > 0 ? (
        <ul aria-label="Chosen files">
          {choose.data.map((file) => (
            <li key={file.file}>
              {file.isVisible
                ? `${file.name ?? file.file}: nixie can see it`
                : `${file.file}: nixie cannot see this file. A file picked under another Google account is not visible to nixie. Choose it again under ${props.connection.account ?? 'the connected account'}.`}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
