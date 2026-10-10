import type { Pointer } from 'bun:ffi';
import { FFIType, dlopen, read } from 'bun:ffi';
import { closeSync, existsSync, openSync } from 'node:fs';
import type { WriterLock } from './types';
import { WriterLockHeldError } from './writer-lock-held-error';

// Takes an exclusive flock on the data directory, the volume's mount root, and never on nixie.db:
// closing any descriptor on nixie.db drops every POSIX lock the process holds on it, SQLite's
// included. The kernel frees the lock when the process dies or calls release.
export function claimWriterLock(dataDir: string): WriterLock {
  const fd = openSync(dataDir, 'r');
  const libc = getLibc();

  if (libc.flock(fd, LOCK_EX | LOCK_NB) !== 0) {
    const errno = libc.readErrno();

    closeSync(fd);
    if (errno === libc.wouldBlock) {
      throw new WriterLockHeldError();
    }
    throw new Error(`flock on ${dataDir} failed with errno ${errno}`);
  }
  const held = { open: true };

  // a second release must never close a descriptor that reused the number, such as a later lock
  return {
    release: () => {
      if (held.open) {
        held.open = false;
        closeSync(fd);
      }
    },
  };
}

const LOCK_EX = 2,
  LOCK_NB = 4;

interface Libc {
  readonly flock: (fd: number, operation: number) => number;
  readonly readErrno: () => number;
  readonly wouldBlock: number;
}

const libcCache: { libc: Libc | null } = { libc: null };

// Bun has no flock, so the lock calls libc's through FFI: glibc or musl on Linux, and macOS
function getLibc(): Libc {
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
  const library = dlopen(findLinuxLibc(), {
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

const MUSL_ARCH: Partial<Record<NodeJS.Architecture, string>> = { arm64: 'aarch64', x64: 'x86_64' };

function findLinuxLibc(): string {
  const muslArch = MUSL_ARCH[process.arch];

  if (muslArch !== undefined && existsSync(`/lib/ld-musl-${muslArch}.so.1`)) {
    return `libc.musl-${muslArch}.so.1`;
  }
  return 'libc.so.6';
}

function readPointedInt(pointer: Pointer | bigint | null): number {
  if (pointer === null || typeof pointer === 'bigint') {
    throw new Error('libc returned no errno location');
  }
  return read.i32(pointer, 0);
}
