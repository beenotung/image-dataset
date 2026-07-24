import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { extract_lines } from '@beenotung/tslib/string'
import { resolveFile } from './file'
import { normalizeUrl } from './page-url'
import { config, SearchEngine } from './config'
import { env } from './env'
import { setupDB } from './setup'
import { execSync } from 'child_process'
import { join } from 'path'
import { dbFile } from './db'

type Mode =
  | null
  | 'download'
  | 'analysis'
  | 'benchmark'
  | 'rename'
  | 'restore'
  | 'webUI'

function parseArguments() {
  let keywords: string[] = []
  let pages: string[] = []
  let force = false
  let mode: Mode = null
  let args = process.argv
  if (args.length == 2) {
    showVersion(console.error)
    console.error('Error: missing arguments')
    console.error('Run "npx image-dataset --help" to see help message')
    process.exit(1)
  }
  for (let i = 2; i < args.length; i++) {
    let arg = args[i]
    let next = args[i + 1]
    switch (arg) {
      case '-p': {
        if (!next) {
          showVersion(console.error)
          console.error('Error: missing port number or page URL after -p')
          process.exit(1)
        }
        args[i] = +next ? '--port' : '--page'
        i--
        continue
      }
      case '-h':
      case '--help': {
        showVersion(console.log)
        console.log(
          `
Usage: npx image-dataset [options]

Options:

General:
  -h, --help                  Show this help message and exit.
  -v, --version               Show the version number and exit.

Download Mode:
  -l, --listFile <path>       Specify a file containing a list of search terms. Each term should be on a new line.
  -k, --keyword "<term>"      Add a single search term for processing. Use quotes if the term contains spaces.
  -p, --page <url>            Collect images from a page URL or local HTML file. Can be repeated.
  -e, --engine <name>         Image search engine to collect from. Default is "google". Supported: google, bing, baidu.
  -d, --downloadDir <dir>     Set the directory where downloads will be saved. Default is "./downloaded".
  -f, --force                 Re-collect pages and keywords even if already marked complete.

Analysis Mode:
  -a, --analysis              Run analysis mode instead of download mode.

Benchmark Mode:
  -b, --benchmark             Measure the time needed to classify images.

Rename Mode:
  -r, --rename                Rename image filenames by content hash.
  -u, --restore               Restore unclassified images to downloaded directory.

Web UI Mode:
  -w, --webUI                 Launch the web-based user interface.
  -p, --port <number>         Set the port for the web UI. Default is 8100.
  -c, --complexity <number>   Set the complexity for image classifier model. Over-complex setting may result in over-fitting.
                              1 for low complexity (default),
                              2-3 for moderate complexity,
                              4-5 for high complexity.

Notes:
  - In download mode, specify at least one collection source: search terms with --listFile or --keyword, or a page URL with --page.
  - Search terms and pages can be combined in one run.
  - "-p" is short for "--port" with a number, "--page" with a URL or path.
  - A mode is automatically selected when a mode-specific option is given. If none are selected, the help message will guide you.
`.trim(),
        )
        process.exit(0)
      }
      case '-v':
      case '--version': {
        showVersion(console.log)
        process.exit(0)
      }
      case '-l':
      case '--listFile': {
        if (!next) {
          showVersion(console.error)
          console.error('Error: missing file path after --listFile')
          process.exit(1)
        }
        mode = 'download'
        keywords.push(...readListFile(next))
        i++
        break
      }
      case '-k':
      case '--keyword': {
        mode = 'download'
        if (!next) {
          showVersion(console.error)
          console.error('Error: missing search term after --keyword')
          process.exit(1)
        }
        keywords.push(next)
        i++
        break
      }
      case '--page': {
        mode = 'download'
        if (!next) {
          showVersion(console.error)
          console.error('Error: missing page URL after --page')
          process.exit(1)
        }
        pages.push(parsePageUrl(next))
        i++
        break
      }
      case '-e':
      case '--engine': {
        if (!next) {
          showVersion(console.error)
          console.error('Error: missing engine name after --engine')
          process.exit(1)
        }
        mode = 'download'
        config.searchEngine = parseSearchEngine(next)
        i++
        break
      }
      case '-d':
      case '--downloadDir': {
        if (!next) {
          showVersion(console.error)
          console.error('Error: missing directory path after --downloadDir')
          process.exit(1)
        }
        mode = 'download'
        config.downloadedRootDir = next
        i++
        break
      }
      case '-f':
      case '--force': {
        force = true
        break
      }
      case '-a':
      case '--analysis': {
        mode = 'analysis'
        break
      }
      case '-b':
      case '--benchmark': {
        mode = 'benchmark'
        break
      }
      case '-r':
      case '--rename': {
        mode = 'rename'
        break
      }
      case '-u':
      case '--restore': {
        mode = 'restore'
        break
      }
      case '-w':
      case '--webUI': {
        mode = 'webUI'
        break
      }
      case '--port': {
        if (!next) {
          showVersion(console.error)
          console.error('Error: missing port number after --port')
          process.exit(1)
        }
        env.PORT = +next
        if (!env.PORT) {
          showVersion(console.error)
          console.error('Error: invalid port number after --port')
          process.exit(1)
        }
        i++
        break
      }
      case '-c':
      case '--complexity': {
        if (!next) {
          showVersion(console.error)
          console.error('Error: missing complexity number after --complexity')
          process.exit(1)
        }
        env.CLASSIFICATION_DIFFICULTY = +next
        if (!(env.CLASSIFICATION_DIFFICULTY > 0)) {
          showVersion(console.error)
          console.error('Error: invalid complexity number after --complexity')
          process.exit(1)
        }
        i++
        break
      }
      default: {
        showVersion(console.error)
        console.error('Error: unknown argument: ' + JSON.stringify(arg))
        process.exit(1)
      }
    }
  }
  if (!mode) {
    console.error('Error: run mode not specified')
    console.error('Run "npx image-dataset --help" to see help message')
    process.exit(1)
  }
  if (mode == 'download' && keywords.length == 0 && pages.length == 0) {
    showVersion(console.error)
    console.error('Error: missing collection source')
    console.error(
      'Specify search terms with --keyword or --listFile, or a page with --page',
    )
    process.exit(1)
  }
  return { keywords, pages, mode, force }
}

function showVersion(log: typeof console.log) {
  let pkg = require(resolveFile('package.json'))
  log(`${pkg.name} v${pkg.version}`)
}

function readListFile(file: string) {
  if (!existsSync(file)) {
    console.error('Error: missing file ' + JSON.stringify(file))
    process.exit(1)
  }
  let text = readFileSync(file).toString()
  let lines = extract_lines(text)
  return lines
}

function parseSearchEngine(name: string): SearchEngine {
  if (name == 'google' || name == 'bing' || name == 'baidu') {
    return name
  }
  showVersion(console.error)
  console.error('Error: unsupported engine: ' + JSON.stringify(name))
  console.error('Supported engines: google, bing, baidu')
  process.exit(1)
}

function parsePageUrl(url: string) {
  try {
    return normalizeUrl(url)
  } catch (error) {
    showVersion(console.error)
    console.error(
      'Error: invalid page URL after --page: ' + JSON.stringify(url),
    )
    if (error instanceof Error && error.message) {
      console.error(error.message)
    }
    process.exit(1)
  }
}

export async function cli() {
  let args = parseArguments()

  await setupDB()

  if (args.mode == 'analysis') {
    let mod = await import('./analysis')
    mod.analysis()
    return
  }

  if (args.mode == 'benchmark') {
    installPlaywright()
    let mod = await import('./benchmark')
    await mod.benchmark()
    return
  }

  if (args.mode == 'rename') {
    let mod = await import('./rename-by-content-hash')
    mod.main()
    return
  }

  if (args.mode == 'restore') {
    let mod = await import('./unclassify')
    mod.restoreUnclassified()
    return
  }

  if (args.mode == 'webUI') {
    setupGitIgnore([
      ...gitIgnoreFiles.db,
      config.downloadedRootDir,
      config.datasetRootDir,
      config.classifiedRootDir,
      config.unclassifiedRootDir,
      config.baseModelDir,
      config.classifierModelDir,
    ])
    let model = await import('./model')
    await model.initClassNames()
    let server = await import('./server')
    server.startServer(env.PORT)
    return
  }

  if (args.mode == 'download') {
    setupGitIgnore([
      ...gitIgnoreFiles.db,
      config.chromiumDir,
      config.downloadedRootDir,
    ])
    installPlaywright()
    let mod = await import('./collect')
    await mod.main({
      keywords: args.keywords,
      pages: args.pages,
      force: args.force,
    })
    return
  }

  let mode: never = args.mode
  console.error('Error: unknown mode: ' + JSON.stringify(mode))
  console.error('Run "npx image-dataset --help" to see help message')
  process.exit(1)
}

let gitIgnoreFiles = {
  db: [dbFile, dbFile + '-shm', dbFile + '-wal'],
}

function setupGitIgnore(files: string[]) {
  let content = ''
  try {
    content = readFileSync('.gitignore', 'utf-8')
  } catch (error) {
    // e.g. file not found
  }

  let newContent = '\n' + content.trim().replaceAll('\r\n', '\n') + '\n'

  for (let file of files) {
    if (file.startsWith('./')) {
      file = file.slice(2)
    }
    if (!newContent.includes('\n' + file + '\n')) {
      newContent += file + '\n'
    }
  }

  newContent = newContent.trim() + '\n'

  if (newContent == content) {
    return
  }

  writeFileSync('.gitignore', newContent)
}

function installPlaywright() {
  execSync('npx playwright install chromium')
}
