import { test, expect } from '@playwright/test'

test.describe('Zone Rendering', () => {
  test('renders all zones', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('interactive-map')).toBeVisible()

    // Check that zones layer exists
    await expect(page.getByTestId('zones-layer')).toBeVisible()

    // Check specific test zones are rendered
    const testZones = ['HEL-030', 'HEL-050', 'ESP-111', 'VAN-Ylästö']
    for (const zoneId of testZones) {
      const zone = page.getByTestId(`zone-${zoneId}`)
      await expect(zone).toBeVisible({ timeout: 5000 })
    }
  })

  test('zones have fill colors', async ({ page }) => {
    await page.goto('/')

    // Get fill color of a zone
    const zone = page.getByTestId('zone-HEL-030')
    const fillColor = await zone.evaluate((el) => window.getComputedStyle(el).fill)

    // Should have a color (not "none")
    expect(fillColor).toBeTruthy()
    expect(fillColor).not.toBe('none')
  })

  test('zones are clickable', async ({ page }) => {
    await page.goto('/')

    const zone = page.getByTestId('zone-HEL-030')

    // Check cursor style indicates clickable
    const cursor = await zone.evaluate((el) => window.getComputedStyle(el).cursor)
    expect(cursor).toBe('pointer')
  })

  test('zones have routing points', async ({ page }) => {
    await page.goto('/')

    // Wait for map to fully load
    await expect(page.getByTestId('interactive-map')).toBeVisible()
    await page.waitForTimeout(500)

    const svg = page.getByTestId('interactive-map-svg')

    // Check that routing point circles exist (r="3")
    const circles = svg.locator('circle[r="3"]')

    // Wait for circles to be rendered
    await page.waitForTimeout(300)
    const count = await circles.count()

    // Should have at least some routing points (may not be all zones if using fixtures)
    expect(count).toBeGreaterThan(0)
  })
})
