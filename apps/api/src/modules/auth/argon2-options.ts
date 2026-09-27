import { Algorithm, type Options } from '@node-rs/argon2';

/** OWASP-recommended argon2id parameters (19 MiB memory, 2 iterations, 1 lane). */
export const ARGON2_OPTIONS: Options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};
