// Whether a file is the place named, or sits under the folder named.
export function isInside(file: string, where: string): boolean {
  return file === where || file.startsWith(`${where}/`);
}
