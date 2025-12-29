import { test, expect } from '@playwright/test'

test.describe('Performance', () => {
  test('no msgpack files load on initial page load', async ({ page }) => {
    const msgpackRequests: string[] = []

    // Monitor all network requests for .msgpack files
    page.on('request', (request) => {
      const url = request.url()
      if (url.includes('.msgpack')) {
        msgpackRequests.push(url)
      }
    })

    // Navigate to the page
    await page.goto('/')

    // Wait for the map to be visible (page fully loaded)
    await expect(page.getByTestId('interactive-map')).toBeVisible()

    // Give some extra time for any lazy-loaded requests
    await page.waitForTimeout(1000)

    // Assert no msgpack files were loaded
    expect(msgpackRequests).toHaveLength(0)
  })

  test('msgpack files only load after zone selection', async ({ page }) => {
    const msgpackRequests: string[] = []

    page.on('request', (request) => {
      const url = request.url()
      if (url.includes('.msgpack')) {
        msgpackRequests.push(url)
      }
    })

    // Navigate and wait for map
    await page.goto('/')
    await expect(page.getByTestId('interactive-map')).toBeVisible()
    await page.waitForTimeout(500)

    // Verify no msgpack loaded yet
    expect(msgpackRequests).toHaveLength(0)

    // Now click on a zone to select it
    const zone = page.getByTestId('zone-HEL-030')
    await zone.click()

    // Wait for routes to load
    await page.waitForTimeout(1000)

    // Now msgpack should have been loaded (exactly 1 for the selected zone)
    expect(msgpackRequests.length).toBeGreaterThan(0)
    expect(msgpackRequests.some((url) => url.includes('HEL-030'))).toBe(true)
  })

  test('initial page load only fetches zones.json and background_map.json', async ({ page }) => {
    const dataRequests: string[] = []

    page.on('request', (request) => {
      const url = request.url()
      // Track requests to /data/ directory
      if (url.includes('/data/') || url.includes('background_map.json')) {
        dataRequests.push(url)
      }
    })

    await page.goto('/')
    await expect(page.getByTestId('interactive-map')).toBeVisible()
    await page.waitForTimeout(1000)

    // Should only have zones.json and background_map.json
    const allowedPatterns = ['zones.json', 'background_map.json']
    
    for (const url of dataRequests) {
      const isAllowed = allowedPatterns.some((pattern) => url.includes(pattern))
      expect(isAllowed).toBe(true)
    }
  })
})
