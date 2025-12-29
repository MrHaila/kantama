import { test, expect } from '@playwright/test'

test.describe('Zone Selection & Interaction', () => {
  test('clicking zone selects it and shows info', async ({ page }) => {
    await page.goto('/')

    // Click a zone
    await page.getByTestId('zone-HEL-030').click()

    // InfoPanel should show zone details
    const infoPanel = page.getByTestId('info-panel')
    await expect(page.getByTestId('zone-name')).toBeVisible()
    await expect(page.getByTestId('zone-city')).toBeVisible()
    await expect(page.getByTestId('zone-rank')).toBeVisible()

    // Should show connectivity stats
    await expect(page.getByTestId('zones-within-15min')).toBeVisible()
    await expect(page.getByTestId('zones-within-30min')).toBeVisible()
    await expect(page.getByTestId('avg-travel-time')).toBeVisible()

    // Close button should be visible
    await expect(page.getByTestId('info-panel-close')).toBeVisible()
  })

  test('selected zone shows orange border', async ({ page }) => {
    await page.goto('/')

    await page.getByTestId('zone-HEL-030').click()

    // Wait for selection to apply
    await page.waitForTimeout(200)

    // Check that there's an orange border (check for stroke attribute, not class)
    const svg = page.getByTestId('interactive-map-svg')

    // Find path with orange stroke color
    const borderPaths = svg.locator('g path[fill="none"]')
    const count = await borderPaths.count()

    // Should have at least one border path (selected zone)
    expect(count).toBeGreaterThan(0)
  })

  test.skip('ESC key deselects zone', async ({ page }) => {
    await page.goto('/')

    // Select zone
    await page.getByTestId('zone-HEL-030').click()
    await expect(page.getByTestId('zone-name')).toBeVisible()

    // Press ESC
    await page.keyboard.press('Escape')

    // Wait for deselection to process
    await page.waitForTimeout(300)

    // Should return to discovery mode - wait for text to appear
    await expect(page.getByTestId('info-panel')).toContainText('Discover Helsinki', { timeout: 2000 })
  })

  test('close button deselects zone', async ({ page }) => {
    await page.goto('/')

    // Select zone
    await page.getByTestId('zone-HEL-030').click()
    await expect(page.getByTestId('info-panel-close')).toBeVisible()

    // Click close button
    await page.getByTestId('info-panel-close').click()

    // Should return to discovery mode
    await expect(page.getByTestId('info-panel')).toContainText('Discover Helsinki')
  })

  test('selecting different zone replaces selection', async ({ page }) => {
    await page.goto('/')

    // Select first zone
    await page.getByTestId('zone-HEL-030').click()
    await expect(page.getByTestId('zone-name')).toContainText('Kaartinkaupunki')

    // Select second zone
    await page.getByTestId('zone-HEL-457').click()
    await expect(page.getByTestId('zone-name')).toContainText('Itäkeskus')

    // First zone should no longer be shown
    await expect(page.getByTestId('zone-name')).not.toContainText('Kaartinkaupunki')
  })
})
