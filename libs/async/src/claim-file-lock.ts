import type { Pointer } from 'bun:ffi';
import { FFIType, dlopen, read } from 'bun:ffi';
import { closeSync, existsSync, openSync } from 'node:fs';
import invariant from 'tiny-invariant';

export type FileLockMode = 'shared' | 'exclusive';

export interface FileLock {
  readonly release: () => void;
}

export type ClaimFileLock = (path: string, mode: FileLockMode) => FileLock | null;

const LOCK_SH = 1;
const LOCK_EX = 2;
const LOCK_NB = 4;

export function claimFileLock(path: string, mode: FileLockMode): FileLock | null {
  const fd = openSync(path, 'r');
  const libc = readLibc();
  const operation = (mode === 'shared' ? LOCK_SH : LOCK_EX) | LOCK_NB;

  if (libc.flock(fd, operation) !== 0) {
    const errno = libc.readErrno();

    closeSync(fd);

    if (errno === libc.wouldBlock) {
      return null;
    }

    throw new Error(`flock on ${path} failed with errno ${String(errno)}`);
  }

  const held = { open: true };

  // The kernel reuses a closed descriptor's number, so a second close could close a later lock.
  return {
    release: () => {
      if (held.open) {
        held.open = false;

        closeSync(fd);
      }
    },
  };
}

interface Libc {
  readonly flock: (fd: number, operation: number) => number;
  readonly readErrno: () => number;
  readonly wouldBlock: number;
}

const libcCache: { libc: Libc | null } = { libc: null };

// Bun has no flock binding, so the lock calls libc's flock through FFI.
function readLibc(): Libc {
  libcCache.libc ??= loadLibc();

  return libcCache.libc;
}

function loadLibc(): Libc {
  if (process.platform === 'darwin') {
    const library = dlopen('libc.dylib', {
      flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
      __error: { args: [], returns: FFIType.ptr },
    });

    return {
      flock: library.symbols.flock,

      // oxlint-disable-next-line no-underscore-dangle -- libc's own symbol name
      readErrno: () => readPointedInt(library.symbols.__error()),
      wouldBlock: 35,
    };
  }

  const library = dlopen(resolveLinuxLibc(), {
    flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    __errno_location: { args: [], returns: FFIType.ptr },
  });

  return {
    flock: library.symbols.flock,

    // oxlint-disable-next-line no-underscore-dangle -- libc's own symbol name
    readErrno: () => readPointedInt(library.symbols.__errno_location()),
    wouldBlock: 11,
  };
}

function readPointedInt(pointer: Pointer | bigint | null): number {
  invariant(typeof pointer === 'number', 'libc returned no errno location');

  return read.i32(pointer, 0);
}

const MUSL_ARCH: Partial<Record<NodeJS.Architecture, string>> = { arm64: 'aarch64', x64: 'x86_64' };

function resolveLinuxLibc(): string {
  const muslArch = MUSL_ARCH[process.arch];

  if (muslArch !== undefined && existsSync(`/lib/ld-musl-${muslArch}.so.1`)) {
    return `libc.musl-${muslArch}.so.1`;
  }

  return 'libc.so.6';
}
