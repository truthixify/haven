declare module 'blake2b' {
  interface Blake2b {
    update(input: Uint8Array | Buffer): Blake2b;
    digest(encoding?: string): Buffer | string;
  }

  function blake2b(
    outLength: number,
    key?: Uint8Array | null,
    salt?: Uint8Array | null,
    personal?: Uint8Array | null,
  ): Blake2b;

  export = blake2b;
}
