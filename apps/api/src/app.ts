import Fastify, { type FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

import { createPrisma } from './db.js'
import { registerErrorHandlers } from './errors.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerOrgRoutes } from './routes/orgs.js'
import { registerOperationsRoutes } from './routes/operations.js'
import { registerFindingsRoutes } from './routes/findings.js'
import { registerAuditRoutes } from './routes/audit.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export interface BuildOptions {
  logger?: boolean
  prefix?: string
  /** Override the SQL database file/URL (used by tests to isolate the DB). */
  databaseUrl?: string
  /** JWT signing secret. Defaults to JWT_SECRET env, then a dev-only default. */
  jwtSecret?: string
}

const DEV_JWT_SECRET = 'dev-only-secret-change-me-in-production'

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const { logger = false, prefix = '/api/v1' } = options
  if (options.databaseUrl) {
    process.env.DATABASE_URL = options.databaseUrl
  }
  const prisma = createPrisma()

  const app = Fastify({ logger })

  await app.register(cors, { origin: true })
  await app.register(jwt, {
    secret: options.jwtSecret ?? process.env.JWT_SECRET ?? DEV_JWT_SECRET,
  })

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Custom Hermes Agent API',
        description:
          'Backend for business operations mapping and internal audits. ' +
          'Organizations, operation maps (nodes/edges), append-only audit log, findings, ' +
          'and RBAC-authenticated users. Every mutating call writes an audit event.',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${process.env.PORT ?? 4000}${prefix}` }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  })
  await app.register(swaggerUi, { routePrefix: `${prefix}/docs` })

  registerErrorHandlers(app)

  app.decorate('prisma', prisma)

  app.get('/health', async () => ({
    status: 'ok',
    service: 'api',
    time: new Date().toISOString(),
  }))

  await app.register(
    async (instance) => {
      instance.get('/', async () => ({
        name: 'Custom Hermes Agent API',
        version: '0.1.0',
      }))
      registerAuthRoutes(instance, { prisma })
      registerOrgRoutes(instance, { prisma })
      registerOperationsRoutes(instance, { prisma })
      registerFindingsRoutes(instance, { prisma })
      registerAuditRoutes(instance, { prisma })
    },
    { prefix }
  )

  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })

  return app
}
