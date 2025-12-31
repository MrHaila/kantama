import { reactive } from 'vue'

export interface LayerVisibility {
  background: boolean
  zoneColors: boolean
  infrastructure: boolean
  transit: boolean
  zoneBorders: boolean
}

const layerVisibility = reactive<LayerVisibility>({
  background: true,
  zoneColors: true,
  infrastructure: true,
  transit: false,
  zoneBorders: true,
})

export function useLayerVisibility() {
  function toggleLayer(layer: keyof LayerVisibility) {
    layerVisibility[layer] = !layerVisibility[layer]
  }

  function setLayerVisibility(layer: keyof LayerVisibility, visible: boolean) {
    layerVisibility[layer] = visible
  }

  return {
    layerVisibility,
    toggleLayer,
    setLayerVisibility,
  }
}
