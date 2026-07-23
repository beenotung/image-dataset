import { detectFileMime } from 'mime-detect'
import { ProgressCli } from '@beenotung/tslib/progress-cli'
import { createHash } from 'crypto'
import { join } from 'path'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { find, seedRow } from 'better-sqlite3-proxy'
import { proxy } from './proxy'
import { config, SearchEngine } from './config'
import { closeBrowser, getPage } from './browser'
import { fileURLToPath } from 'url'
import { urlToDomain, urlToFolderName } from './page-url'
import { Page } from 'playwright'

let cli = new ProgressCli()

export async function collectByKeyword(
  keyword: string,
  options: { cli_prefix?: string; engine?: SearchEngine } = {},
) {
  let engine = options.engine ?? config.searchEngine
  switch (engine) {
    case 'google':
      return collectByKeywordFromGoogle(keyword, options)
    default: {
      engine satisfies never
      throw new Error('unsupported search engine: ' + engine)
    }
  }
}

export async function collectFromPage(options: {
  url: string
  cli_prefix?: string
}) {
  let { url } = options
  let cli_prefix = options.cli_prefix || ''
  let folder = urlToFolderName(url)

  cli.update(`${cli_prefix}collecting from ${url}...`)

  let dir = join(config.downloadedRootDir, folder)
  await mkdir(dir, { recursive: true })

  let domain = urlToDomain(url)
  let domain_id = seedRow(proxy.domain, { domain })
  seedRow(proxy.page, { url }, { domain_id, complete_time: null })

  let page = await getPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await scrollPageForLazyImages(page)

  let images = await collectImagesFromPage(page, url)

  cli.update(`${cli_prefix}collecting from ${url}: ${images.length} images ...`)
  for (let image of images) {
    await saveImage({
      image,
      cli_prefix,
      dir,
      keyword_id: null,
    })
  }
  cli.update(`${cli_prefix}collected from ${url}: ${images.length} images.`)
  cli.nextLine()
}

async function scrollPageForLazyImages(
  page: Awaited<ReturnType<typeof getPage>>,
) {
  await page.evaluate(async () => {
    let lastHeight = 0
    for (let i = 0; i < 20; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight)
      await new Promise(resolve => setTimeout(resolve, 500))
      let height = document.documentElement.scrollHeight
      if (height == lastHeight) {
        break
      }
      lastHeight = height
    }
    window.scrollTo(0, 0)
  })
}

async function collectImagesFromPage(page: Page, page_url: string) {
  return page.evaluate(page_url => {
    let pageBase = new URL(page_url)
    let images: ImageItem[] = []
    let seen = new Set<string>()
    for (let img of document.querySelectorAll('img')) {
      let image_src =
        img.currentSrc ||
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-lazy-src') ||
        ''
      if (!image_src || image_src.startsWith('data:')) {
        continue
      }
      try {
        image_src = new URL(image_src, pageBase).href
      } catch {
        continue
      }
      if (seen.has(image_src)) {
        continue
      }
      seen.add(image_src)
      images.push({ page_url, image_src, alt: img.alt || '' })
    }
    return images
  }, page_url)
}

async function collectByKeywordFromGoogle(
  keyword: string,
  options: { cli_prefix?: string } = {},
) {
  let cli_prefix = options.cli_prefix || ''

  cli.update(`${cli_prefix}searching "${keyword}"...`)

  let dir = join(config.downloadedRootDir, keyword)
  await mkdir(dir, { recursive: true })

  let keyword_id = seedRow(proxy.keyword, { keyword })

  let page = await getPage()

  function isNavigationDestroyError(error: unknown) {
    return /Execution context was destroyed|most likely because of a navigation/i.test(
      String(error),
    )
  }

  async function waitForChallenge() {
    for (;;) {
      try {
        let challenged =
          /\/sorry\b/i.test(page.url()) ||
          (await page.evaluate(
            () =>
              !!document.querySelector(
                '#captcha-form, iframe[src*="recaptcha"]',
              ),
          ))
        if (!challenged) return
        cli.update(
          `${cli_prefix}please resolve the challenge in the browser...`,
        )
      } catch (error) {
        if (!isNavigationDestroyError(error)) throw error
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  await page.goto('https://images.google.com', {
    waitUntil: 'domcontentloaded',
  })
  await waitForChallenge()
  await page.fill('form textarea[name="q"]', keyword)
  await Promise.all([
    page.waitForURL(/https:\/\/www\.google\.com\/(search|sorry)/, {
      waitUntil: 'domcontentloaded',
    }),
    page
      .evaluate(() => {
        let form = document.querySelector(
          'form[role="search"]',
        ) as HTMLFormElement
        form.submit()
      })
      .catch(error => {
        if (!isNavigationDestroyError(error)) throw error
      }),
  ])
  await waitForChallenge()
  await page.waitForURL(/^https:\/\/www\.google\.com\/search/, {
    waitUntil: 'domcontentloaded',
  })

  async function collectImages(): Promise<ImageItem[]> {
    for (;;) {
      try {
        return await page.evaluate(async () => {
          let items = document.querySelectorAll<HTMLElement>('[data-lpage]')
          let images: ImageItem[] = []
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
      } catch (error) {
        if (!isNavigationDestroyError(error)) throw error
        await waitForChallenge()
      }
    }
  }

  async function scrollForMore(beforeCount: number) {
    for (;;) {
      try {
        await page.evaluate(async beforeCount => {
          let idle = 0
          for (;;) {
            let items = document.querySelectorAll<HTMLElement>('[data-lpage]')
            let item = items[items.length - 1]
            if (!item) return
            let img = item.querySelector('img')
            ;(img || item).scrollIntoView({
              behavior: 'smooth',
              block: 'end',
            })
            window.scrollTo({
              top: Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight,
              ),
              behavior: 'smooth',
            })
            let root = document.querySelector<HTMLElement>('#islrc')
            if (root) {
              root.scrollTop = root.scrollHeight
            }
            await new Promise(resolve => setTimeout(resolve, 1500))

            let count = document.querySelectorAll('[data-lpage]').length
            if (count > beforeCount) return

            let atBottom =
              window.innerHeight + window.scrollY >=
              document.documentElement.scrollHeight - 100

            let moreLinks = document.querySelectorAll<HTMLAnchorElement>(
              'a[role="button"][href*="start="]',
            )
            let more = moreLinks[moreLinks.length - 1]
            if (more) {
              more.scrollIntoView({ behavior: 'smooth', block: 'center' })
              await new Promise(resolve => setTimeout(resolve, 500))
              let moreRect = more.getBoundingClientRect()
              if (moreRect.width * moreRect.height > 0) {
                more.click()
                await new Promise(resolve => setTimeout(resolve, 1500))
                if (
                  document.querySelectorAll('[data-lpage]').length > beforeCount
                ) {
                  return
                }
              }
            }

            let bars = document.querySelectorAll('[role="progressbar"]')
            let bar = bars[bars.length - 1]
            if (bar) {
              let rect = bar.getBoundingClientRect()
              if (rect.width * rect.height > 0) {
                await new Promise(resolve => setTimeout(resolve, 500))
                if (
                  document.querySelectorAll('[data-lpage]').length > beforeCount
                ) {
                  return
                }
                idle = 0
                continue
              }
            }

            idle++
            if (idle > (atBottom ? 1 : 2)) return
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }, beforeCount)
        return
      } catch (error) {
        if (!isNavigationDestroyError(error)) throw error
        await waitForChallenge()
      }
    }
  }

  let lastCount = 0
  let attempt = 0
  for (;;) {
    let images = await collectImages()
    let count = images.length
    if (count != lastCount) {
      attempt = 0
    }
    if (count > 0 && count == lastCount) {
      attempt++
      if (attempt > 2) {
        break
      }
    }
    cli.update(`${cli_prefix}searching "${keyword}": ${count} images ...`)
    for (let image of images.slice(lastCount)) {
      await saveImage({ image, cli_prefix, dir, keyword_id })
    }
    cli.update(
      `${cli_prefix}scrolling for more images of "${keyword}": ${count} images ...`,
    )
    await scrollForMore(count)
    lastCount = count
  }
  cli.update(`${cli_prefix}searched "${keyword}": ${lastCount} images.`)
  cli.nextLine()
}

type ImageItem = {
  page_url: string
  image_src: string
  alt: string
}

async function saveImage(options: {
  image: ImageItem
  cli_prefix: string
  dir: string
  keyword_id: number | null
}) {
  let { page_url, image_src, alt } = options.image
  let { cli_prefix, dir, keyword_id } = options

  let result = image_src.startsWith('file://')
    ? await loadImage(image_src)
    : await downloadImage(image_src)

  if (!result.ok) {
    cli.nextLine()
    cli.writeln(`${cli_prefix}skip image (${result.reason}): ${image_src}`)
    return
  }

  let { ext, buffer } = result

  let hash = createHash('sha256')
  hash.write(buffer)
  let filename = hash.digest().toString('hex') + '.' + ext

  let domain = urlToDomain(page_url)
  let domain_id = seedRow(proxy.domain, { domain })
  let page_id = seedRow(proxy.page, { url: page_url }, { domain_id })
  let src = storableImageUrl(image_src)

  let row = find(proxy.image, { filename })
  if (!row) {
    let file = join(dir, filename)
    let fileSize = await getFileSize(file)
    if (fileSize != buffer.length) {
      await writeFile(file, buffer)
    }

    let id = proxy.image.push({
      filename,
      page_id,
      keyword_id,
      src,
      alt,
      embedding: null,
    })
    row = proxy.image[id]
  } else {
    if (alt && (row.alt?.length || 0) < alt.length) {
      row.alt = alt
    }
    if (src && !row.src) {
      row.src = src
    }
  }
  let image_id = row.id!
  if (keyword_id) {
    seedRow(proxy.image_keyword, { image_id, keyword_id })
  }
  seedRow(proxy.image_page, { image_id, page_id })
  if (src) {
    seedRow(proxy.image_url, { image_id, url: src })
  }
}

async function downloadImage(url: string) {
  let res
  let reason = ''
  for (let i = 0; i < 3; i++) {
    try {
      res = await fetch(url)
      if (res.ok) {
        break
      }
      reason = `HTTP ${res.status}`
    } catch (error) {
      reason = String(error)
    }
    if (i < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  if (!res?.ok) {
    return { ok: false as const, reason }
  }

  let mimeType = res.headers.get('Content-Type')
  if (!mimeType?.startsWith('image/')) {
    return { ok: false as const, reason: 'not an image' }
  }

  let ext = mimeType.split('/')[1].split(';')[0]

  let buffer
  try {
    let binary = await res.arrayBuffer()
    buffer = Buffer.from(binary)
  } catch (error) {
    return { ok: false as const, reason: String(error) }
  }

  return { ok: true as const, mimeType, ext, buffer }
}

async function loadImage(url: string) {
  let file = fileURLToPath(url)
  let mimeType = await detectFileMime(file)
  if (!mimeType?.startsWith('image/')) {
    return { ok: false as const, reason: 'not an image' }
  }
  let ext = mimeType.split('/')[1].split(';')[0]
  let buffer = await readFile(file)
  return { ok: true as const, mimeType, ext, buffer }
}

async function getFileSize(file: string) {
  try {
    return (await stat(file)).size
  } catch (error) {
    return 0
  }
}

function storableImageUrl(image_src: string) {
  image_src = image_src.trim()
  if (!image_src) {
    return null
  }
  if (image_src.startsWith('data:')) {
    return null
  }
  return image_src
}

export async function main(options: { keywords: string[]; pages: string[] }) {
  let { keywords, pages } = options

  let n = pages.length + keywords.length
  if (n === 0) {
    return
  }

  let i = 0

  for (let url of pages) {
    i++
    let cli_prefix = `[${i}/${n}] `
    if (find(proxy.page, { url })?.complete_time) {
      console.log(`${cli_prefix}skip page ${url}`)
      continue
    }
    await collectFromPage({ url, cli_prefix })
    find(proxy.page, { url })!.complete_time = Date.now()
  }

  for (let keyword of keywords) {
    i++
    let cli_prefix = `[${i}/${n}] `
    if (find(proxy.keyword, { keyword })?.complete_time) {
      console.log(`${cli_prefix}skip "${keyword}"`)
      continue
    }
    await collectByKeyword(keyword, { cli_prefix })
    find(proxy.keyword, { keyword })!.complete_time = Date.now()
  }

  await closeBrowser()
}
