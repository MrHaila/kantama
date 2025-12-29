import { test, expect } from '@playwright/test'

test.describe('Opas Map Application', () => {
  test('loads without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()

    // Should have no console errors
    expect(errors).toHaveLength(0)
  })

  test('shows loading state then map', async ({ page }) => {
    await page.goto('/')

    // Map should load within reasonable time
    await expect(page.getByTestId('interactive-map')).toBeVisible({ timeout: 10000 })
  })

  test('displays all main UI components', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('interactive-map')).toBeVisible()

    // Background map
    await expect(page.getByTestId('background-map')).toBeVisible()

    // Legend
    await expect(page.getByTestId('heatmap-legend')).toBeVisible()

    // Info panel (discovery mode)
    await expect(page.getByTestId('info-panel')).toBeVisible()
    await expect(page.getByTestId('info-panel')).toContainText('Discover Helsinki')

    // Controls
    await expect(page.getByTestId('transport-mode-public')).toBeVisible()
    await expect(page.getByTestId('time-period-morning')).toBeVisible()
    await expect(page.getByTestId('time-period-evening')).toBeVisible()
    await expect(page.getByTestId('time-period-midnight')).toBeVisible()
  })

  test('transport mode buttons show correct state', async ({ page }) => {
    await page.goto('/')

    // Public should be active by default
    const publicButton = page.getByTestId('transport-mode-public')
    await expect(publicButton).toBeVisible()

    // Bike and car should be disabled
    const bikeButton = page.getByTestId('transport-mode-bike')
    const carButton = page.getByTestId('transport-mode-car')
    await expect(bikeButton).toBeDisabled()
    await expect(carButton).toBeDisabled()
  })
})
