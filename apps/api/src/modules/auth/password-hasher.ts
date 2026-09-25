import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { ARGON2_OPTIONS as OPTIONS } from './argon2-options';

@Injectable()
export class PasswordHasher {
  /** A valid hash of a random value, verified against when the account does not exist (timing parity). */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(hashValue: string, password: string): Promise<boolean> {
    try {
      return await verify(hashValue, password);
    } catch {
      return false;
    }
  }

  /** Spends the same time as a real verification so login does not reveal whether an email exists. */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= hash('dummy-password-for-timing-parity', OPTIONS);
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
