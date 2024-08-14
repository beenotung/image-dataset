import { existsSync, readFileSync } from 'fs'
import { extract_lines } from '@beenotung/tslib/string'
import { closeBrowser, collectByKeyword } from './collect'
import { proxy } from './proxy'
import { find } from 'better-sqlite3-proxy'
import { resolveFile } from './file'
import { analysis } from './analysis'
import { config } from './config'

type Mode = 'download' | 'analysis'

function parseArguments() {
  let keywords: string[] = []
  let mode: Mode = 'download'
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
  -h, --help                  Show this help message and exit.
  -v, --version               Show the version number and exit.
  -l, --listFile <path>       Specify a file containing a list of search terms. Each term should be on a new line.
  -s, --searchTerm "<term>"   Add a single search term for processing. Use quotes if the term contains spaces.
  -d, --downloadDir <dir>     Set the directory where downloads will be saved.

Notes:
  - At least one search term must be specified, either using --listFile or --searchTerm.
  - If an argument is missing or incorrect, the program will terminate with an error message.
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
        keywords.push(...readListFile(next))
        i++
        break
      }
      case '-s':
      case '--searchTerm': {
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
        config.rootDir = next
        i++
        break
      }
      case '-a':
      case '--analysis': {
        mode = 'analysis'
        break
      }
      default: {
        showVersion(console.error)
        console.error('Error: unknown argument: ' + JSON.stringify(arg))
        process.exit(1)
      }
    }
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

  if (args.mode == 'analysis') {
    analysis()
    return
  }

  for (let keyword of args.keywords) {
    if (find(proxy.keyword, { keyword })?.complete_time) {
      console.log(`skip "${keyword}"`)
      continue
    }
    await collectByKeyword(keyword)
    find(proxy.keyword, { keyword })!.complete_time = Date.now()
  }

  await closeBrowser()
}
