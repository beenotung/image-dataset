import { chromium } from 'playwright'
import { getStealthChromiumArgs } from 'graceful-playwright'
import { config } from './config'

export let getPage = async () => {
  let args = getStealthChromiumArgs()
  let context = await chromium.launchPersistentContext(config.chromiumDir, {
    headless: false,
    args,
    acceptDownloads: false,
  })
  let page = context.pages()[0] || (await context.newPage())
  getPage = async () => page
  return page
}

export async function closeBrowser() {
  let page = await getPage()
  let context = page.context()
  await page.close()
  await context.close()
}
