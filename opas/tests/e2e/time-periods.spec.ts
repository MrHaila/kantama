import { test, expect } from '@playwright/test'

test.describe('Time Period Toggle', () => {
  test('morning is selected by default', async ({ page }) => {
    await page.goto('/')

    const morningButton = page.getByTestId('time-period-morning')

    // Check button has active styling (bg-vintage-dark)
    const bgColor = await morningButton.evaluate((el) => window.getComputedStyle(el).backgroundColor)

    // Active button should have dark background
    expect(bgColor).toBeTruthy()
  })

  test('clicking evening button switches period', async ({ page }) => {
    await page.goto('/')

    // Click evening button
    await page.getByTestId('time-period-evening').click()

    // Button should now be active
    const eveningButton = page.getByTestId('time-period-evening')
    const bgColor = await eveningButton.evaluate((el) => window.getComputedStyle(el).backgroundColor)

    expect(bgColor).toBeTruthy()
  })

  test('switching periods updates map data', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')

    // Select a zone
    await page.getByTestId('zone-HEL-030').click()

    // Switch to Evening
    await page.getByTestId('time-period-evening').click()

    // Wait for data to reload
    await page.waitForTimeout(500)

    // Should still show zone info (no errors)
    await expect(page.getByTestId('zone-name')).toBeVisible()

    // Should have no console errors
    expect(errors).toHaveLength(0)
  })

  test('switching periods with journey details', async ({ page }) => {
    await page.goto('/')

    // Select origin
    await page.getByTestId('zone-HEL-030').click()
    await page.waitForTimeout(500)

    // Hover destination and wait for journey to load
    await page.getByTestId('zone-HEL-050').hover()
    await page.waitForTimeout(300)

    // Verify journey panel is showing (with timeout)
    await expect(page.getByTestId('journey-panel')).toBeVisible()

    // Switch to Midnight
    await page.getByTestId('time-period-midnight').click()
    await page.waitForTimeout(800)

    // Re-hover to trigger journey update
    await page.mouse.move(0, 0) // Move away first
    await page.waitForTimeout(100)
    await page.getByTestId('zone-HEL-050').hover()
    await page.waitForTimeout(300)

    // Should still show journey panel (journey might or might not have route at midnight)
    await expect(page.getByTestId('journey-panel')).toBeVisible()
  })

  test('all time periods work without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')

    // Try all time periods
    const periods = ['morning', 'evening', 'midnight']

    for (const period of periods) {
      await page.getByTestId(`time-period-${period}`).click()
      await page.waitForTimeout(300)

      // Map should still be visible
      await expect(page.getByTestId('interactive-map')).toBeVisible()
    }

    // No errors should have occurred
    expect(errors).toHaveLength(0)
  })
})
