import { test, expect } from '@playwright/test'

test.describe('Journey Details & Hover States', () => {
  test('shows journey panel when zone is selected', async ({ page }) => {
    await page.goto('/')

    // Select origin zone
    await page.getByTestId('zone-HEL-030').click()

    // Journey panel should appear
    await expect(page.getByTestId('journey-panel')).toBeVisible()

    // Should show hint initially
    await expect(page.getByTestId('journey-hint')).toBeVisible()
    await expect(page.getByTestId('journey-hint')).toContainText('Hover over another zone')
  })

  test.skip('hovering zone shows journey details', async ({ page }) => {
    await page.goto('/')

    // Select origin
    await page.getByTestId('zone-HEL-030').click()
    await expect(page.getByTestId('journey-hint')).toBeVisible()

    // Wait a bit for route data to load
    await page.waitForTimeout(500)

    // Hover over destination zone
    await page.getByTestId('zone-HEL-050').hover()

    // Wait for journey panel to update
    await page.waitForTimeout(200)

    // Should show journey details (journey-from/to only show when there's a route)
    // Check journey panel exists and is not showing hint or error
    await expect(page.getByTestId('journey-panel')).toBeVisible()

    // Should show duration (which is always visible in journey success state)
    await expect(page.getByTestId('journey-duration')).toBeVisible({ timeout: 2000 })

    // Duration should contain "min"
    await expect(page.getByTestId('journey-duration')).toContainText('min')
  })

  test.skip('journey panel shows from and to zone names', async ({ page }) => {
    await page.goto('/')

    await page.getByTestId('zone-HEL-030').click()
    await page.waitForTimeout(500)
    await page.getByTestId('zone-HEL-050').hover()
    await page.waitForTimeout(200)

    // Check zone names are displayed
    await expect(page.getByTestId('journey-from')).toBeVisible({ timeout: 2000 })
    await expect(page.getByTestId('journey-from')).toContainText('Kaartinkaupunki')
    await expect(page.getByTestId('journey-to')).toContainText('Punavuori')
  })

  test.skip('hovering back shows hint again', async ({ page }) => {
    await page.goto('/')

    await page.getByTestId('zone-HEL-030').click()
    await page.waitForTimeout(500)

    // Hover destination
    await page.getByTestId('zone-HEL-050').hover()
    await page.waitForTimeout(200)
    await expect(page.getByTestId('journey-duration')).toBeVisible({ timeout: 2000 })

    // Move mouse away (hover over origin zone)
    await page.getByTestId('zone-HEL-030').hover()
    await page.waitForTimeout(200)

    // Should show hint again
    await expect(page.getByTestId('journey-hint')).toBeVisible()
  })

  test('shows hovered zone border', async ({ page }) => {
    await page.goto('/')

    await page.getByTestId('zone-HEL-030').click()
    await page.getByTestId('zone-HEL-050').hover()

    // Wait for hover state
    await page.waitForTimeout(100)

    // Should show orange border for hovered zone
    const svg = page.getByTestId('interactive-map-svg')
    const borders = svg.locator('path.stroke-vintage-orange')
    const count = await borders.count()

    // Should have 2 borders: selected + hovered
    expect(count).toBeGreaterThanOrEqual(2)
  })
})
