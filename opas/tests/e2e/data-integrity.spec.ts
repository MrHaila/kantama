import { test, expect } from '@playwright/test'

test.describe('Data Integrity', () => {
  test('reachability data loads with non-zero connectivity scores', async ({ page }) => {
    // Collect console errors during load
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto('/')
    await expect(page.getByTestId('interactive-map')).toBeVisible()

    // Wait for reachability computation to complete
    // The store logs "Reachability scores computed for X zones" when done
    await page.waitForTimeout(2000)

    // Hover over a central Helsinki zone that should have good connectivity
    const zone = page.getByTestId('zone-HEL-030')
    await zone.hover()

    // Wait for info panel to show connectivity stats
    await expect(page.getByTestId('zones-within-15min')).toBeVisible({ timeout: 5000 })

    // Get the text content which should be like "X zones within 15 min"
    const within15minText = await page.getByTestId('zones-within-15min').textContent()

    // Extract the number (first part before "zone")
    const match = within15minText?.match(/^(\d+)/)
    const zonesWithin15min = match ? parseInt(match[1], 10) : 0

    // Central Helsinki (HEL-030) should have multiple zones within 15 min
    // If this is 0, routes haven't loaded correctly
    expect(zonesWithin15min).toBeGreaterThan(0)

    // Also check 30 min threshold
    const within30minText = await page.getByTestId('zones-within-30min').textContent()
    const match30 = within30minText?.match(/^(\d+)/)
    const zonesWithin30min = match30 ? parseInt(match30[1], 10) : 0

    expect(zonesWithin30min).toBeGreaterThan(0)
    // 30 min should reach more zones than 15 min
    expect(zonesWithin30min).toBeGreaterThanOrEqual(zonesWithin15min)

    // No console errors should have occurred during data loading
    const routeErrors = consoleErrors.filter((e) => e.includes('routes') || e.includes('404'))
    expect(routeErrors).toHaveLength(0)
  })

  test('multiple zones have valid connectivity data', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('interactive-map')).toBeVisible()

    // Wait for reachability computation
    await page.waitForTimeout(2000)

    // Check multiple zones have non-zero connectivity
    const zonesToCheck = ['HEL-030', 'HEL-101', 'ESP-111']
    
    for (const zoneId of zonesToCheck) {
      const zone = page.getByTestId(`zone-${zoneId}`)
      await zone.hover()
      
      // Wait for info panel update
      await expect(page.getByTestId('zones-within-15min')).toBeVisible({ timeout: 3000 })
      
      const text = await page.getByTestId('zones-within-30min').textContent()
      const match = text?.match(/^(\d+)/)
      const count = match ? parseInt(match[1], 10) : 0
      
      // Each zone should have some zones reachable within 30 min
      expect(count).toBeGreaterThan(0)
    }
  })
})
