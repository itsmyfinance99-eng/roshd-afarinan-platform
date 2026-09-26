import { toLatinDigits } from './normalize';

/**
 * Passwords that meet the length/letter/digit rules but top public breach lists (ST-25.10), so
 * they are guessed first. Compared case-insensitively, with Persian digits folded to Latin.
 */
const COMMON_PASSWORDS = new Set([
  '1q2w3e4r',
  '1q2w3e4r5t',
  '1qaz2wsx',
  '1qazxsw2',
  '12qwaszx',
  '123qweasd',
  '1234qwer',
  '12345qwert',
  '123456789a',
  '12345678a',
  '1234567a',
  'a1234567',
  'a12345678',
  'a123456789',
  'aa123456',
  'abc12345',
  'abc123456',
  'abcd1234',
  'asdf1234',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword1',
  'q1w2e3r4',
  'q1w2e3r4t5',
  'qwe12345',
  'qweasd123',
  'qwer1234',
  'qwerty12',
  'zaq12wsx',
  'trustno1',
]);

/**
 * Common words that are only "strengthened" with digits (password123, 2024qwerty, admin1234):
 * the word part is guessed first and the digits are brute-forced cheaply.
 */
const COMMON_WORDS = new Set([
  'abc',
  'abcd',
  'abcdef',
  'admin',
  'administrator',
  'asdf',
  'asdfgh',
  'asdfghjkl',
  'baseball',
  'batman',
  'changeme',
  'charlie',
  'dragon',
  'football',
  'hello',
  'iloveyou',
  'iran',
  'letmein',
  'login',
  'love',
  'master',
  'monkey',
  'password',
  'princess',
  'qazwsx',
  'qwerty',
  'qwertyuiop',
  'roshd',
  'roshdafarinan',
  'secret',
  'shadow',
  'sunshine',
  'superman',
  'tehran',
  'test',
  'user',
  'welcome',
  'yazd',
  'zxcvbn',
  'zxcvbnm',
]);

export function isCommonPassword(password: string): boolean {
  const value = toLatinDigits(password).trim().toLowerCase();
  if (COMMON_PASSWORDS.has(value)) return true;
  const word = /^(\d+)?([a-z]+)[\d!@#$%^&*.]*$/.exec(value)?.[2];
  return word !== undefined && COMMON_WORDS.has(word);
}
