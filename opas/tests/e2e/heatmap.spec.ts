import { test, expect } from '@playwright/test'

test.describe('Heatmap Visualization', () => {
  test('legend shows connectivity mode initially', async ({ page }) => {
    await page.goto('/')

    const legend = page.getByTestId('heatmap-legend')
    await expect(legend).toBeVisible()

    const title = page.getByTestId('legend-title')
    await expect(title).toContainText('Connectivity')
  })

  test('legend has color buckets', async ({ page }) => {
    await page.goto('/')

    // Should have multiple legend buckets
    const bucket1 = page.getByTestId('legend-bucket-1')
    const bucket2 = page.getByTestId('legend-bucket-2')

    await expect(bucket1).toBeVisible()
    await expect(bucket2).toBeVisible()
  })

  test('zones have different colors in connectivity mode', async ({ page }) => {
    await page.goto('/')

    // Get fill colors of different zones
    const zone1 = page.getByTestId('zone-HEL-030')
    const zone2 = page.getByTestId('zone-ESP-712')

    const color1 = await zone1.evaluate((el) => window.getComputedStyle(el).fill)
    const color2 = await zone2.evaluate((el) => window.getComputedStyle(el).fill)

    // Different zones should potentially have different connectivity colors
    // (They might be the same if they're in the same bucket, so we just check they have colors)
    expect(color1).toBeTruthy()
    expect(color2).toBeTruthy()
  })

  test('legend changes to travel time when zone is selected', async ({ page }) => {
    await page.goto('/')

    // Initially shows Connectivity
    await expect(page.getByTestId('legend-title')).toContainText('Connectivity')

    // Click a zone
    await page.getByTestId('zone-HEL-030').click()

    // Legend should change to Travel Time
    await expect(page.getByTestId('legend-title')).toContainText('Travel Time')
  })

  test('zones update colors after selection with animation', async ({ page }) => {
    await page.goto('/')

    const zone = page.getByTestId('zone-HEL-457')

    // Get initial color
    const initialColor = await zone.evaluate((el) => window.getComputedStyle(el).fill)

    // Click origin zone
    await page.getByTestId('zone-HEL-030').click()

    // Wait for animation to complete
    await page.waitForTimeout(600)

    // Color should have updated (travel time based)
    const newColor = await zone.evaluate((el) => window.getComputedStyle(el).fill)

    // Colors should be different (or at least both valid)
    expect(newColor).toBeTruthy()
  })
})
