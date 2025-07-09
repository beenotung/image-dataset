import { chromium } from 'playwright'

export let getPage = async () => {
  let browser = await chromium.launch({ headless: false })
  let page = await browser.newPage()
  getPage = async () => page
  return page
}

export async function closeBrowser() {
  let page = await getPage()
  let browser = page.context().browser()
  await page.close()
  await browser?.close()
}
