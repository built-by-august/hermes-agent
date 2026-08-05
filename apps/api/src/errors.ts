import type { FastifyError, FastifyInstance } from 'fastify'

/**
 * ApiError — thrown by handlers, rendered by the global error handler in the
 * RFC 7807-ish shape defined in packages/contracts (apiErrorSchema):
 * { error, message, status, details? }
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function isPrismaError(err: unknown): err is { code: string; message: string } {
  return typeof err === 'object' && err !== null && 'code' in err && 'message' in err
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: 'not_found', message: 'Route not found', status: 404 })
  })

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiError) {
      reply.code(error.status).send({
        error: error.code,
        message: error.message,
        status: error.status,
        ...(error.details !== undefined ? { details: error.details } : {}),
      })
      return
    }

    // Fastify validation errors (request body/params/querystring)
    if (error.validation) {
      reply.code(400).send({
        error: 'validation_error',
        message: error.message,
        status: 400,
        details: error.validation,
      })
      return
    }

    // Prisma errors → friendly HTTP codes
    if (isPrismaError(error)) {
      switch (error.code) {
        case 'P2002':
          reply
            .code(409)
            .send({ error: 'conflict', message: 'A record with those unique fields already exists', status: 409 })
          return
        case 'P2025':
          reply.code(404).send({ error: 'not_found', message: 'The requested record was not found', status: 404 })
          return
        case 'P2003':
          reply.code(400).send({ error: 'invalid_reference', message: 'Referenced record does not exist', status: 400 })
          return
      }
    }

    // Fastify/JWT errors carry their own statusCode (401 etc.)
    const statusCode = 'statusCode' in error ? Number(error.statusCode) : 500
    if (statusCode >= 400 && statusCode < 500) {
      reply.code(statusCode).send({
        error: 'request_error',
        message: error.message,
        status: statusCode,
      })
      return
    }

    request.log.error(error)
    reply.code(500).send({ error: 'internal_error', message: 'Internal server error', status: 500 })
  })
}
