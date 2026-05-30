import React, { useEffect, useState, useMemo } from 'react'
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

export function SemanticGraphViewer(): React.ReactElement {
  const [graph, setGraph] = useState<{ nodes: any[], edges: any[] }>({ nodes: [], edges: [] })

  useEffect(() => {
    const fetchGraph = async () => {
      if ((window as any).electronAPI?.devGetKnowledgeGraph) {
        const data = await (window as any).electronAPI.devGetKnowledgeGraph()
        setGraph(data)
      }
    }
    fetchGraph()
    const interval = setInterval(fetchGraph, 5000)
    return () => clearInterval(interval)
  }, [])

  const { nodes, edges } = useMemo(() => toFlow(graph), [graph])

  return (
    <section className="cdt-panel cdt-graph-panel">
      <header className="cdt-panel__header">
        <h2>Semantic Graph</h2>
        <span>{nodes.length} nodes / {edges.length} edges</span>
      </header>
      <div className="cdt-graph">
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </section>
  )
}

function toFlow(graph: { nodes: any[], edges: any[] }): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((node, index) => {
      // Color coding by level
      let bgColor = '#333'
      if (node.level === 'persistent') bgColor = '#224422'
      if (node.level === 'archival') bgColor = '#442222'
      if (node.level === 'session') bgColor = '#222244'
      
      const score = (node.trustScore * (1 + node.usageScore)).toFixed(2)

      return {
        id: node.id,
        position: {
          x: (index % 5) * 250,
          y: Math.floor(index / 5) * 150,
        },
        data: { 
          label: (
            <div style={{ fontSize: '10px', textAlign: 'left' }}>
              <strong style={{ color: '#61dafb' }}>[{node.level}]</strong> {node.id.split('-').slice(0,2).join('-')}
              <div style={{ color: '#ffb86c', margin: '4px 0' }}>Score: {score}</div>
              <div style={{ color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                {node.content}
              </div>
            </div>
          ) 
        },
        style: {
          background: bgColor,
          color: '#fff',
          border: `1px solid ${node.isPinned ? '#ffb86c' : '#555'}`,
          borderRadius: '8px',
          padding: '8px',
          width: 180
        },
        type: 'default',
      }
    }),
    edges: graph.edges.map((edge, index) => ({
      id: `${edge.sourceId}-${edge.targetId}-${index}`,
      source: edge.sourceId,
      target: edge.targetId,
      label: `${edge.relationType} (${edge.weight})`,
      animated: true,
      style: { stroke: '#888' }
    })),
  }
}
