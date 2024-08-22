import { chromium } from 'playwright'
import { ProgressCli } from '@beenotung/tslib/progress-cli'
import { createHash } from 'crypto'
import { join } from 'path'
import { mkdir, stat, writeFile } from 'fs/promises'
import { find, seedRow } from 'better-sqlite3-proxy'
import { proxy } from './proxy'
import { config } from './config'

let cli = new ProgressCli()

let getPage = async () => {
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

export async function collectByKeyword(keyword: string) {
  cli.update(`searching "${keyword}"...`)

  let dir = join(config.rootDir, keyword)
  await mkdir(dir, { recursive: true })

  let keyword_id = seedRow(proxy.keyword, { keyword })

  let page = await getPage()

  await page.goto('https://images.google.com', {
    waitUntil: 'domcontentloaded',
  })
  await page.fill('form textarea[name="q"]', keyword)
  await page.click('form button[type="submit"]')
  await page.waitForURL(/^https:\/\/www\.google\.com\/search/, {
    waitUntil: 'domcontentloaded',
  })

  type ImageItem = Awaited<ReturnType<typeof collectImages>>[number]

  async function collectImages() {
    let images = await page.evaluate(async () => {
      let items = document.querySelectorAll<HTMLElement>('[data-lpage]')
      let images = []
      for (let item of items) {
        let page_url = item.dataset.lpage!
        let img = item.querySelector('img')!
        let loading_gif =
          'data:image/gif;base64,R0lGODlhAQABAIAAAP///////yH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
        while (img.src == loading_gif) {
          img.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          })
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        images.push({ page_url, image_src: img.src, alt: img.alt })
      }
      return images
    })
    return images
  }

  async function scrollToBottom() {
    await page.evaluate(async () => {
      for (;;) {
        let imgs = document.querySelectorAll<HTMLElement>(
          '[data-lpage] g-img img',
        )
        let img = imgs[imgs.length - 1]
        if (!img) return
        img.scrollIntoView({ behavior: 'smooth', block: 'center' })
        await new Promise(resolve => setTimeout(resolve, 500))

        let bars = document.querySelectorAll('[role="progressbar"]')
        let bar = bars[bars.length - 1]
        if (!bar) return
        let rect = bar.getBoundingClientRect()
        let size = rect.width * rect.height
        if (size == 0) return

        await new Promise(resolve => setTimeout(resolve, 500))
      }
    })
  }

  async function saveImage(image: ImageItem) {
    let { page_url, image_src, alt } = image
    let res = await fetch(image_src)

    let mimeType = res.headers.get('Content-Type')
    if (!mimeType?.startsWith('image/')) {
      return
    }
    let ext = mimeType.split('/')[1].split(';')[0]

    let binary = await res.arrayBuffer()
    let buffer = Buffer.from(binary)

    let hash = createHash('sha256')
    hash.write(buffer)
    let filename = hash.digest().toString('hex') + '.' + ext

    let file = join(dir, filename)

    let row = find(proxy.image, { filename })
    if (row) {
      return
    }

    let fileSize = await getFileSize(file)
    if (fileSize != buffer.length) {
      await writeFile(file, buffer)
    }

    let domain = new URL(page_url).hostname
    let domain_id = seedRow(proxy.domain, { domain })
    let page_id = seedRow(proxy.page, { url: page_url }, { domain_id })

    proxy.image.push({ filename, page_id, keyword_id, alt, embedding: null })
  }

  let lastCount = 0
  for (;;) {
    let images = await collectImages()
    let count = images.length
    if (count > 0 && count == lastCount) {
      break
    }
    cli.update(`searching "${keyword}": ${count} images ...`)
    for (let image of images.slice(lastCount)) {
      await saveImage(image)
    }
    await scrollToBottom()
    lastCount = count
  }
  cli.update(`searched "${keyword}": ${lastCount} images.`)
  cli.nextLine()
}

async function getFileSize(file: string) {
  try {
    return (await stat(file)).size
  } catch (error) {
    return 0
  }
}
