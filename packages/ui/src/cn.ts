import { clsx, type ClassValue } from 'clsx';

/** Joins class names (conditional). Tokens keep class lists short, so no merge step is needed. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
