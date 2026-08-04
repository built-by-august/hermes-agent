import Fastify, { type FastifyInstance } from 'fastify'

export interface BuildOptions {
  logger?: boolean
  prefix?: string
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const { logger = false, prefix = '/api/v1' } = options

  const app = Fastify({ logger })

  await app.register(import('@fastify/cors'), { origin: true })

  app.get('/health', async () => ({ status: 'ok', service: 'api', time: new Date().toISOString() }))

  await app.register(
    async (instance) => {
      instance.get('/', async () => ({ name: 'Custom Hermes Agent API', version: '0.1.0' }))
    },
    { prefix }
  )

  return app
}
