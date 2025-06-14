import { copyFileSync, existsSync, readFileSync } from 'fs'
import { extract_lines } from '@beenotung/tslib/string'
import { resolveFile } from './file'
import { config } from './config'
import { env } from './env'
import { setupDB } from './setup'
import { execSync } from 'child_process'
import { join } from 'path'

type Mode = null | 'download' | 'analysis' | 'rename' | 'restore' | 'webUI'

function parseArguments() {
  let keywords: string[] = []
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
  -s, --searchTerm "<term>"   Add a single search term for processing. Use quotes if the term contains spaces.
  -d, --downloadDir <dir>     Set the directory where downloads will be saved. Default is "./downloaded".

Analysis Mode:
  -a, --analysis              Run analysis mode instead of download mode.

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
  - In download mode, at least one search term must be specified, either using --listFile or --searchTerm.
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
      case '-s':
      case '--searchTerm': {
        mode = 'download'
        if (!next) {
          showVersion(console.error)
          console.error('Error: missing search term after --searchTerm')
          process.exit(1)
        }
        keywords.push(next)
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
      case '-a':
      case '--analysis': {
        mode = 'analysis'
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
      case '-p':
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
  if (mode == 'download' && keywords.length == 0) {
    showVersion(console.error)
    console.error('Error: missing keywords')
    console.error('Either specify with --searchTerm or --listFile')
    process.exit(1)
  }
  return { keywords, mode }
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

export async function cli() {
  let args = parseArguments()

  await setupDB()

  if (args.mode == 'analysis') {
    let mod = await import('./analysis')
    mod.analysis()
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
    installTensorflow()
    let model = await import('./model')
    await model.initClassNames()
    let server = await import('./server')
    server.startServer(env.PORT)
    return
  }

  if (args.mode == 'download') {
    installPlaywright()
    let mod = await import('./collect')
    await mod.main(args.keywords)
    return
  }

  let mode: never = args.mode
  console.error('Error: unknown mode: ' + JSON.stringify(mode))
  console.error('Run "npx image-dataset --help" to see help message')
  process.exit(1)
}

function installPlaywright() {
  execSync('npx playwright install chromium')
}

function installTensorflow() {
  let filename = 'tensorflow.dll'
  let src = 'node_modules/@tensorflow/tfjs-node/deps/lib/' + filename

  // test direct dependency on @tensorflow/tfjs-node
  {
    let dest_dir = 'node_modules/@tensorflow/tfjs-node/lib/napi-v8'
    let dest_file = join(dest_dir, filename)

    if (existsSync(src) && existsSync(dest_dir) && !existsSync(dest_file)) {
      copyFileSync(src, dest_file)
      return
    }
  }

  // test indirect dependency on @tensorflow/tfjs-node
  {
    let dest_dir =
      'node_modules/image-dataset/node_modules/@tensorflow/tfjs-node/lib/napi-v8'
    let dest_file = join(dest_dir, filename)

    if (existsSync(src) && existsSync(dest_dir) && !existsSync(dest_file)) {
      copyFileSync(src, dest_file)
      return
    }
  }
}
