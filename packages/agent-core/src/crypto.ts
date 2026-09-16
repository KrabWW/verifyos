import crypto from 'node:crypto';

/**
 * 凭据加解密：AES-256-GCM
 * 密文格式（base64）：iv(12B) ‖ authTag(16B) ‖ ciphertext
 * key：32 字节 hex（64 字符），从 env CREDENTIAL_ENCRYPTION_KEY 读
 */
export class CredentialCrypto {
  private readonly key: Buffer;

  constructor(keyHex: string) {
    if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY 必须是 64 位 hex（32 字节）');
    }
    this.key = Buffer.from(keyHex, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decrypt(payload: string): string {
    const buf = Buffer.from(payload, 'base64');
    if (buf.length < 29) throw new Error('密文长度非法');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }

  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
