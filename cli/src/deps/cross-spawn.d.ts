declare module 'cross-spawn' {
  import type { ChildProcess, SpawnOptions } from 'node:child_process';
  function spawn(command: string, args?: readonly string[] | null, options?: SpawnOptions): ChildProcess;
  export = spawn;
}
