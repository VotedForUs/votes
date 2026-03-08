/**
 * Thin wrapper around fs (or mocked fs) that can throw on the next write/mkdir
 * for testing error paths. Used with npm "mock-fs" when tests need setShouldThrowError behavior.
 */

import type * as fs from "node:fs";

/**
 * Wraps an fs-like object and forwards methods. setShouldThrowError(true, message)
 * makes the next writeFileSync or mkdirSync throw; then the flag is cleared.
 */
export function wrapFsWithThrow(fsModule: typeof fs): typeof fs & {
  setShouldThrowError: (shouldThrow: boolean, message?: string) => void;
} {
  let throwOnNextWrite = false;
  let throwMessage = "Mock error";

  const checkWrite = (): void => {
    if (throwOnNextWrite) {
      throwOnNextWrite = false;
      throw new Error(throwMessage);
    }
  };
  const checkMkdir = (): void => {
    if (throwOnNextWrite) {
      throwOnNextWrite = false;
      throw new Error(throwMessage);
    }
  };

  const setShouldThrowError = (shouldThrow: boolean, message = "Mock error"): void => {
    throwOnNextWrite = shouldThrow;
    throwMessage = message;
  };

  return {
    ...fsModule,
    writeFileSync: (path: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions) => {
      checkWrite();
      return fsModule.writeFileSync(path, data as never, options as never);
    },
    mkdirSync: (path: fs.PathLike, options?: fs.MakeDirectoryOptions) => {
      checkMkdir();
      return fsModule.mkdirSync(path, options);
    },
    readFileSync: fsModule.readFileSync,
    existsSync: fsModule.existsSync,
    readdirSync: fsModule.readdirSync,
    rmSync: fsModule.rmSync,
    statSync: fsModule.statSync,
    unlinkSync: fsModule.unlinkSync,
    setShouldThrowError,
  } as typeof fs & { setShouldThrowError: (shouldThrow: boolean, message?: string) => void };
}
