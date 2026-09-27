import { loginSchema, paginationQuerySchema } from '@roshd/validation';
import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from '../errors/app-exception';
import { toOpenApiSchema, ZodValidationPipe } from './zod';

describe('ZodValidationPipe', () => {
  it('returns parsed (transformed) data', () => {
    const pipe = new ZodValidationPipe(paginationQuerySchema);
    expect(pipe.transform({ page: '2' })).toEqual({ page: 2, pageSize: 20 });
  });

  it('throws VALIDATION_FAILED with field paths', () => {
    const pipe = new ZodValidationPipe(loginSchema);
    try {
      pipe.transform({ email: 'nope' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationFailedError);
      const e = error as ValidationFailedError;
      expect(e.status).toBe(400);
      expect(e.code).toBe('VALIDATION_FAILED');
      expect(e.details?.map((d) => d.path).sort()).toEqual(['email', 'password']);
    }
  });
});

describe('toOpenApiSchema', () => {
  it('produces an object schema with required fields', () => {
    const json = toOpenApiSchema(loginSchema);
    expect(json.type).toBe('object');
    expect(json.required).toEqual(expect.arrayContaining(['email', 'password']));
    expect(json.$schema).toBeUndefined();
  });
});
