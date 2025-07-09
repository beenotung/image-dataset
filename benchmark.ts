import { basename } from 'path'
import { closeBrowser, getPage } from './browser'
import { startServer } from './server'

export async function benchmark() {
  let port = 3000
  let page = await getPage()
  let server = await startServer(port)
  await page.goto(`http://localhost:${port}`)

  let result = await page.evaluate(() => {
    let win = window as any
    return win.benchmark()
  })
  console.log(result)
  await closeBrowser()
  server.close()
}

if (basename(process.argv[1]) == basename(__filename)) {
  benchmark()
}
