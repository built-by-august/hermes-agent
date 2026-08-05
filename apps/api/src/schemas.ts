import type { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

/**
 * Convert a Zod schema from packages/contracts into a JSON Schema usable by
 * Fastify for runtime validation (ajv) and OpenAPI generation (@fastify/swagger).
 * Default target (jsonSchema7) is used so nullable fields serialize as
 * `type: ["x","null"]` unions — compatible with ajv and fast-json-stringify
 * without extra ajv options.
 */
export function s<T extends z.ZodType>(schema: T): Record<string, unknown> {
  return zodToJsonSchema(schema, {
    // Objects keep unknown keys: request bodies are lenient, and Json fields
    // (settings/context/evidence) pass through fast-json-stringify intact.
    allowedAdditionalProperties: true,
  }) as Record<string, unknown>
}
