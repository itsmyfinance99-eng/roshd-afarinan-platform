import { Body, Param, type PipeTransform, Query } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';
import { ValidationFailedError } from '../errors/app-exception';

/** Validates and transforms input with a Zod schema; failures become VALIDATION_FAILED (400). */
export class ZodValidationPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationFailedError(
        result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.') || '(root)',
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}

type JsonSchema = Record<string, unknown> & {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
};

/** Converts a Zod schema to an OpenAPI-compatible JSON schema (request side). */
export function toOpenApiSchema(schema: ZodType): JsonSchema {
  const json = z.toJSONSchema(schema, {
    io: 'input',
    target: 'openapi-3.0',
    unrepresentable: 'any',
  }) as JsonSchema;
  delete json.$schema;
  return json;
}

type MethodDescriptorTarget = object;

function applyMethodDecorator(
  decorator: MethodDecorator,
  target: MethodDescriptorTarget,
  key: string | symbol | undefined,
) {
  if (key === undefined) return;
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor) decorator(target, key, descriptor);
}

/** `@ZodBody(schema)` — validates the body and documents it in OpenAPI. */
export function ZodBody(schema: ZodType): ParameterDecorator {
  return (target, key, index) => {
    Body(new ZodValidationPipe(schema))(target, key, index);
    applyMethodDecorator(ApiBody({ schema: toOpenApiSchema(schema) }), target, key);
  };
}

/** `@ZodQuery(schema)` — validates the query string and documents each parameter. */
export function ZodQuery(schema: ZodType): ParameterDecorator {
  return (target, key, index) => {
    Query(new ZodValidationPipe(schema))(target, key, index);
    const json = toOpenApiSchema(schema);
    for (const [name, prop] of Object.entries(json.properties ?? {})) {
      applyMethodDecorator(
        ApiQuery({ name, required: json.required?.includes(name) ?? false, schema: prop }),
        target,
        key,
      );
    }
  };
}

/** `@ZodParam('id', schema)` — validates a single route parameter. */
export function ZodParam(name: string, schema: ZodType): ParameterDecorator {
  return Param(name, new ZodValidationPipe(schema));
}
