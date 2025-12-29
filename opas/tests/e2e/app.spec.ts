import { test, expect } from '@playwright/test'

test.describe('Opas Map Application', () => {
  test('loads the main page', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
  })

  test.skip('displays background map layer', async ({ page }) => {
    await page.goto('/')
    // TODO: Add data-testid="background-map" to BackgroundMap.vue
    await expect(page.getByTestId('background-map')).toBeVisible({ timeout: 10000 })
  })

  test.skip('displays interactive map layer', async ({ page }) => {
    await page.goto('/')
    // TODO: Add data-testid="interactive-map" to InteractiveMap.vue
    await expect(page.getByTestId('interactive-map')).toBeVisible({ timeout: 10000 })
  })
})
