const muslArchitectures: Partial<Record<NodeJS.Architecture, string>> = {
  arm64: 'aarch64',
  x64: 'x86_64',
};

// A glibc host can also carry musl's loader, so the libc that loads decides, not the files.
export function openLinuxLibc<Library>(
  openLibrary: (name: string) => Library,
  architecture: NodeJS.Architecture,
): Library {
  try {
    return openLibrary('libc.so.6');
  } catch (error) {
    const muslArchitecture = muslArchitectures[architecture];

    if (muslArchitecture === undefined) {
      throw error;
    }

    return openLibrary(`libc.musl-${muslArchitecture}.so.1`);
  }
}
