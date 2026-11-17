import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Secret } from "./secret";

export interface EncryptedKey {
  ciphertext: string;
  iv: string;
  tag: string;
  wrappedDek: string;
  dekIv: string;
  dekTag: string;
  kekId: string;
}

export class KeyVaultError extends Error {
  constructor(readonly code: "kek_invalid" | "decrypt_failed" | "kek_mismatch") {
    super(code);
  }
}

/**
 * Envelope encryption for BYOK provider keys (ADR-010, ADR-023).
 * - Each key gets a fresh 256-bit data key (DEK); the key is AES-256-GCM encrypted with it.
 * - The DEK is wrapped with the key-encryption key (KEK). Today the KEK is an
 *   owner-supplied secret (BYOK_KEK); with D6 it moves to a cloud KMS behind this interface.
 * - `aad` (workspace + provider) is authenticated, so a ciphertext copied to
 *   another workspace's row fails to decrypt.
 * Plaintext only ever leaves as a Secret, used in-memory for one call.
 */
export function createKeyVault(opts: { kek: Secret; kekId: string }) {
  const kek = Buffer.from(opts.kek.reveal(), "base64");
  if (kek.length !== 32) throw new KeyVaultError("kek_invalid");

  const seal = (key: Buffer, plaintext: Buffer, aad: string) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { ct, iv, tag: cipher.getAuthTag() };
  };
  const open = (key: Buffer, ct: Buffer, iv: Buffer, tag: Buffer, aad: string) => {
    const d = createDecipheriv("aes-256-gcm", key, iv);
    d.setAAD(Buffer.from(aad, "utf8"));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]);
  };

  return {
    kekId: opts.kekId,
    encrypt(plaintext: Secret, aad: string): EncryptedKey {
      const dek = randomBytes(32);
      const data = seal(dek, Buffer.from(plaintext.reveal(), "utf8"), aad);
      const wrapped = seal(kek, dek, `dek:${aad}`);
      dek.fill(0);
      return {
        ciphertext: data.ct.toString("base64"),
        iv: data.iv.toString("base64"),
        tag: data.tag.toString("base64"),
        wrappedDek: wrapped.ct.toString("base64"),
        dekIv: wrapped.iv.toString("base64"),
        dekTag: wrapped.tag.toString("base64"),
        kekId: opts.kekId,
      };
    },
    decrypt(enc: EncryptedKey, aad: string): Secret {
      if (enc.kekId !== opts.kekId) throw new KeyVaultError("kek_mismatch");
      try {
        const b = (s: string) => Buffer.from(s, "base64");
        const dek = open(kek, b(enc.wrappedDek), b(enc.dekIv), b(enc.dekTag), `dek:${aad}`);
        const plain = open(dek, b(enc.ciphertext), b(enc.iv), b(enc.tag), aad);
        dek.fill(0);
        return new Secret(plain.toString("utf8"));
      } catch {
        throw new KeyVaultError("decrypt_failed");
      }
    },
  };
}

export type KeyVault = ReturnType<typeof createKeyVault>;
