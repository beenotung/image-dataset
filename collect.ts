import { ProgressCli } from '@beenotung/tslib/progress-cli'
import { createHash } from 'crypto'
import { join } from 'path'
import { mkdir, stat, writeFile } from 'fs/promises'
import { find, seedRow } from 'better-sqlite3-proxy'
import { proxy } from './proxy'
import { config, ImageSourceSite } from './config'
import { closeBrowser, getPage } from './browser'

let cli = new ProgressCli()

export async function collectByKeyword(
  keyword: string,
  options: { cli_prefix?: string; site?: ImageSourceSite } = {},
) {
  let site = options.site ?? config.imageSourceSite
  switch (site) {
    case 'google':
      return collectByKeywordFromGoogle(keyword, options)
    default: {
      site satisfies never
      throw new Error('unsupported site: ' + site)
    }
  }
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

  type ImageItem = Awaited<ReturnType<typeof collectImages>>[number]

  async function collectImages() {
    for (;;) {
      try {
        return await page.evaluate(async () => {
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
            await new Promise(resolve => setTimeout(resolve, 2000))

            let count = document.querySelectorAll('[data-lpage]').length
            if (count > beforeCount) return

            let bars = document.querySelectorAll('[role="progressbar"]')
            let bar = bars[bars.length - 1]
            if (bar) {
              let rect = bar.getBoundingClientRect()
              if (rect.width * rect.height > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000))
                if (
                  document.querySelectorAll('[data-lpage]').length > beforeCount
                ) {
                  return
                }
                continue
              }
            }

            idle++
            if (idle > 3) return
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }, beforeCount)
        return
      } catch (error) {
        if (!isNavigationDestroyError(error)) throw error
        await waitForChallenge()
      }
    }
  }

  async function saveImage(image: ImageItem) {
    let { page_url, image_src, alt } = image
    let res
    let reason = ''
    for (let i = 0; i < 3; i++) {
      try {
        res = await fetch(image_src)
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
      cli.nextLine()
      cli.writeln(`${cli_prefix}skip image (${reason}): ${image_src}`)
      return
    }

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
  let attempt = 0
  for (;;) {
    let images = await collectImages()
    let count = images.length
    if (count != lastCount) {
      attempt = 0
    }
    if (count > 0 && count == lastCount) {
      attempt++
      if (attempt > 3) {
        break
      }
    }
    cli.update(`${cli_prefix}searching "${keyword}": ${count} images ...`)
    for (let image of images.slice(lastCount)) {
      await saveImage(image)
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

async function getFileSize(file: string) {
  try {
    return (await stat(file)).size
  } catch (error) {
    return 0
  }
}

export async function main(keywords: string[]) {
  let n = keywords.length
  for (let i = 0; i < n; i++) {
    let cli_prefix = `[${i + 1}/${n}] `
    let keyword = keywords[i]
    if (find(proxy.keyword, { keyword })?.complete_time) {
      console.log(`${cli_prefix}skip "${keyword}"`)
      continue
    }
    await collectByKeyword(keyword, { cli_prefix })
    find(proxy.keyword, { keyword })!.complete_time = Date.now()
  }
  await closeBrowser()
}
