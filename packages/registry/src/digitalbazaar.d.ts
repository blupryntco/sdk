declare module "@digitalbazaar/ecdsa-multikey" {
  export interface Signer {
    id?: string;
    algorithm: string;
    sign(input: { data: Uint8Array }): Promise<Uint8Array>;
  }

  export interface KeyPair {
    id?: string;
    controller?: string;
    publicKeyMultibase: string;
    signer(): Signer;
  }

  export function generate(options: {
    id?: string;
    controller?: string;
    curve: string;
  }): Promise<KeyPair>;
}

declare module "@digitalbazaar/ecdsa-jcs-2019-cryptosuite" {
  export interface Cryptosuite {
    name: string;
  }

  export function createSignCryptosuite(): Cryptosuite;
  export function createVerifyCryptosuite(): Cryptosuite;
}

declare module "@digitalbazaar/data-integrity" {
  import type { Cryptosuite } from "@digitalbazaar/ecdsa-jcs-2019-cryptosuite";
  import type { Signer } from "@digitalbazaar/ecdsa-multikey";

  export class DataIntegrityProof {
    constructor(options: { signer?: Signer; cryptosuite: Cryptosuite });
  }
}

declare module "@digitalbazaar/vc" {
  import type { DataIntegrityProof } from "@digitalbazaar/data-integrity";

  export type DocumentLoader = (url: string) => Promise<{
    contextUrl: null;
    documentUrl: string;
    document: unknown;
  }>;

  export function issue(options: {
    credential: Record<string, unknown>;
    suite: DataIntegrityProof;
    documentLoader: DocumentLoader;
  }): Promise<Record<string, unknown>>;

  export function verifyCredential(options: {
    credential: Record<string, unknown>;
    suite: DataIntegrityProof;
    documentLoader: DocumentLoader;
    now?: Date;
    checkStatus?: () => Promise<{ verified: boolean }>;
  }): Promise<{ verified: boolean; error?: unknown }>;

  export function _checkCredential(options: {
    credential: Record<string, unknown>;
    now?: Date;
  }): void;
}

declare module "@digitalbazaar/credentials-context" {
  export const contexts: Map<string, unknown>;
}

declare module "@digitalbazaar/data-integrity-context" {
  export const contexts: Map<string, unknown>;
}

declare module "@digitalbazaar/multikey-context" {
  export const contexts: Map<string, unknown>;
}
