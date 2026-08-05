import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getApiClient } from '../lib/api'
import type {
  CreateEdgeRequest,
  CreateNodeRequest,
  OperationEdge,
  OperationMap,
  OperationNode,
  OperationNodeType,
} from '@repo/contracts'
import { Badge, ErrorAlert, Spinner } from '../components/ui'

const NODE_TYPES: OperationNodeType[] = ['process', 'step', 'tool', 'system', 'handoff']
const NODE_COLORS: Record<OperationNodeType, string> = {
  process: '#6ea8fe',
  step: '#a78bfa',
  tool: '#34d399',
  system: '#fbbf24',
  handoff: '#f87171',
}

export function OperationsMapPage() {
  const { orgId } = useAuth()
  const api = getApiClient()
  const [map, setMap] = useState<OperationMap | null>(null)
  const [selected, setSelected] = useState<OperationNode | null>(null)
  const [error, setError] = useState<string | null>(null)

  // new-node form
  const [name, setName] = useState('')
  const [type, setType] = useState<OperationNodeType>('step')
  const [busy, setBusy] = useState(false)

  // new-edge form
  const [edgeSource, setEdgeSource] = useState('')
  const [edgeTarget, setEdgeTarget] = useState('')
  const [edgeLabel, setEdgeLabel] = useState('')
  const [edgeType, setEdgeType] = useState<OperationEdge['type']>('data_flow')

  const reload = useCallback(async () => {
    const m = await api.getMap(orgId)
    setMap(m)
  }, [api, orgId])

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load map'))
  }, [reload])

  const nodeById = useMemo(() => {
    const m = new Map<string, OperationNode>()
    map?.nodes.forEach((n) => m.set(n.id, n))
    return m
  }, [map])

  async function onCreateNode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const req: CreateNodeRequest = {
        name,
        type,
        status: 'active',
        metadata: {},
        position: { x: 80 + map!.nodes.length * 24, y: 120 + map!.nodes.length * 18 },
      }
      const node = await api.createNode(orgId, req)
      setName('')
      setType('step')
      await reload()
      setSelected(node)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function onUpdateNode(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    setError(null)
    try {
      await api.updateNode(orgId, selected.id, {
        name: selected.name,
        status: selected.status,
      })
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function onCreateEdge(e: FormEvent) {
    e.preventDefault()
    if (!edgeSource || !edgeTarget) return
    setError(null)
    try {
      const req: CreateEdgeRequest = {
        source: edgeSource,
        target: edgeTarget,
        label: edgeLabel || undefined,
        type: edgeType,
      }
      await api.createEdge(orgId, req)
      setEdgeSource('')
      setEdgeTarget('')
      setEdgeLabel('')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create edge failed')
    }
  }

  if (error) return <ErrorAlert message={error} />
  if (!map) return <Spinner label="Loading operations map…" />

  const BOX = 150

  return (
    <section>
      <h1>Operations map</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Describe how your business runs. Nodes are processes, steps, tools, systems, or handoffs;
        edges are dependencies, handoffs, or data flows.
      </p>

      {/* Graph canvas (layout by stored positions) */}
      <div
        className="card"
        style={{
          position: 'relative',
          minHeight: 380,
          overflow: 'auto',
          background:
            'repeating-linear-gradient(45deg, var(--bg-elev-2) 0 10px, transparent 10px 20px)',
        }}
        aria-label="Operation map graph"
      >
        {map.nodes.length === 0 && <p className="muted">No nodes yet — add one below.</p>}
        <svg
          width="100%"
          height={380}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          aria-hidden="true"
        >
          {map.edges.map((edge) => {
            const s = nodeById.get(edge.source)
            const t = nodeById.get(edge.target)
            if (!s || !t) return null
            return (
              <line
                key={edge.id}
                x1={s.position.x + BOX / 2}
                y1={s.position.y + 24}
                x2={t.position.x + BOX / 2}
                y2={t.position.y + 24}
                stroke="var(--border)"
                strokeWidth={2}
              />
            )
          })}
        </svg>
        {map.nodes.map((n) => (
          <button
            key={n.id}
            className="btn btn--ghost"
            onClick={() => setSelected(n)}
            style={{
              position: 'absolute',
              left: n.position.x,
              top: n.position.y,
              width: BOX,
              textAlign: 'left',
              borderLeft: `4px solid ${NODE_COLORS[n.type]}`,
              background: selected?.id === n.id ? 'var(--bg-elev-2)' : 'var(--bg-elev)',
            }}
            aria-pressed={selected?.id === n.id}
          >
            <div style={{ fontWeight: 600 }}>{n.name}</div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              {n.type} · {n.status}
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid--2" style={{ marginTop: '1rem' }}>
        {/* Add node */}
        <form className="card" onSubmit={onCreateNode}>
          <h2>Add operation node</h2>
          <div className="field">
            <label htmlFor="nName">Name</label>
            <input
              id="nName"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="nType">Type</label>
            <select
              id="nType"
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value as OperationNodeType)}
            >
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            Add node
          </button>
        </form>

        {/* Edit selected node */}
        <form className="card" onSubmit={onUpdateNode}>
          <h2>Edit node</h2>
          {selected ? (
            <>
              <div className="field">
                <label htmlFor="eName">Name</label>
                <input
                  id="eName"
                  className="input"
                  value={selected.name}
                  onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="eStatus">Status</label>
                <select
                  id="eStatus"
                  className="select"
                  value={selected.status}
                  onChange={(e) =>
                    setSelected({ ...selected, status: e.target.value as OperationNode['status'] })
                  }
                >
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                  <option value="needs_attention">needs_attention</option>
                </select>
              </div>
              <div className="row">
                <Badge value={selected.type}>{selected.type}</Badge>
                <button className="btn btn--primary" type="submit">
                  Save
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Select a node on the map to edit it.</p>
          )}
        </form>
      </div>

      {/* Add edge */}
      <form className="card" onSubmit={onCreateEdge} style={{ marginTop: '1rem' }}>
        <h2>Add edge</h2>
        <div className="grid grid--4">
          <div className="field">
            <label htmlFor="eSrc">Source</label>
            <select
              id="eSrc"
              className="select"
              value={edgeSource}
              onChange={(e) => setEdgeSource(e.target.value)}
              required
            >
              <option value="">—</option>
              {map.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="eTgt">Target</label>
            <select
              id="eTgt"
              className="select"
              value={edgeTarget}
              onChange={(e) => setEdgeTarget(e.target.value)}
              required
            >
              <option value="">—</option>
              {map.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="eLbl">Label</label>
            <input
              id="eLbl"
              className="input"
              value={edgeLabel}
              onChange={(e) => setEdgeLabel(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="eTyp">Edge type</label>
            <select
              id="eTyp"
              className="select"
              value={edgeType}
              onChange={(e) => setEdgeType(e.target.value as OperationEdge['type'])}
            >
              <option value="dependency">dependency</option>
              <option value="handoff">handoff</option>
              <option value="data_flow">data_flow</option>
            </select>
          </div>
        </div>
        <button className="btn btn--primary" type="submit" disabled={!edgeSource || !edgeTarget}>
          Add edge
        </button>
      </form>
    </section>
  )
}
