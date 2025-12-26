import { ref, computed } from 'vue'
import { useMapDataStore } from '../stores/mapData'

export type AppState = 'loading' | 'ready' | 'error'

export function useAppState() {
  const store = useMapDataStore()
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  const currentState = computed<AppState>(() => {
    if (error.value) return 'error'
    if (isLoading.value || !store.zones) return 'loading'
    return 'ready'
  })

  async function initialize() {
    if (store.zones) return // Already loaded

    try {
      error.value = null
      isLoading.value = true
      await store.loadData()
    } catch (e) {
      console.error('Failed to initialize app:', e)
      error.value = e instanceof Error ? e.message : 'Failed to load data'
    } finally {
      isLoading.value = false
    }
  }

  return {
    currentState,
    error,
    initialize,
  }
}
