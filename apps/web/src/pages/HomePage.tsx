import { operationNodeSchema } from '@repo/contracts'

export function HomePage() {
  const sample = operationNodeSchema.parse({
    id: '9b8a4e6e-5e84-4f4e-8a1b-3b1234567890',
    orgId: '9b8a4e6e-5e84-4f4e-8a1b-3b1234567891',
    name: 'Client intake',
    type: 'process',
    position: { x: 120, y: 80 },
    createdAt: '2026-08-04T16:40:01Z',
  })

  return (
    <section>
      <h1>Custom Hermes Agent</h1>
      <p>Deploy into operations. Map them. Audit from the inside. Automate via coded skills.</p>
      <p>
        Sample operation node from shared contracts: <strong>{sample.name}</strong> ({sample.type},
        status {sample.status})
      </p>
    </section>
  )
}
