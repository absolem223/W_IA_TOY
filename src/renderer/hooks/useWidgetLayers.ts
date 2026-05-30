import { useState, useCallback } from 'react'

export type LayerType = 'base' | 'overlay' | 'popup' | 'modal'

export interface UseWidgetLayersReturn {
  activeLayer: LayerType
  isClosing: boolean
  setIsClosing: (closing: boolean) => void
  requestLayer: (layer: LayerType) => void
  releaseLayer: (layer: LayerType) => void
  getPointerEvents: (layer: LayerType) => 'auto' | 'none'
}

/**
 * Centraliza la gestión de interactividad del widget.
 * Previene "overlays fantasmas" manejando pointer-events jerárquicamente.
 */
export function useWidgetLayers(): UseWidgetLayersReturn {
  const [activeLayer, setActiveLayer] = useState<LayerType>('base')
  const [isClosing, setIsClosing] = useState(false)

  // Niveles de prioridad (mayor bloquea menor)
  const LAYER_LEVELS: Record<LayerType, number> = {
    base: 0,
    overlay: 1,
    popup: 2,
    modal: 3
  }

  const requestLayer = useCallback((layer: LayerType) => {
    setActiveLayer(current => {
      // Solo permite escalar o saltar a la misma prioridad, no degradar si un modal está activo
      return LAYER_LEVELS[layer] >= LAYER_LEVELS[current] ? layer : current
    })
  }, [])

  const releaseLayer = useCallback((layer: LayerType) => {
    setActiveLayer(current => (current === layer ? 'base' : current))
  }, [])

  const getPointerEvents = useCallback((layer: LayerType): 'auto' | 'none' => {
    // Si el widget se está cerrando, se bloquea la interactividad en todas las capas
    if (isClosing) return 'none'
    
    // Una capa es interactiva si su nivel es >= al nivel activo
    return LAYER_LEVELS[layer] >= LAYER_LEVELS[activeLayer] ? 'auto' : 'none'
  }, [activeLayer, isClosing])

  return {
    activeLayer,
    isClosing,
    setIsClosing,
    requestLayer,
    releaseLayer,
    getPointerEvents
  }
}
