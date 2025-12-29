import { ref } from 'vue'

export interface ZoneAnimationOptions {
  duration?: number // milliseconds
  easing?: string // CSS easing function
  onComplete?: () => void
}

export function useZoneAnimation(
  initialColor: string,
  options: ZoneAnimationOptions = {}
) {
  const currentColor = ref(initialColor)
  const isAnimating = ref(false)
  const currentDelay = ref(0)

  const { duration = 150, onComplete } = options

  /**
   * Start animation to new color after specified delay
   */
  function startAnimation(newColor: string, delayMs: number = 0) {
    isAnimating.value = true
    currentDelay.value = delayMs

    // Apply delay before starting color transition
    setTimeout(() => {
      currentColor.value = newColor

      // Mark animation complete after transition duration
      setTimeout(() => {
        isAnimating.value = false
        onComplete?.()
      }, duration)
    }, delayMs)
  }

  /**
   * Immediately set color without animation
   */
  function setColorImmediate(color: string) {
    currentColor.value = color
    isAnimating.value = false
  }

  return {
    currentColor,
    isAnimating,
    currentDelay,
    startAnimation,
    setColorImmediate,
  }
}
