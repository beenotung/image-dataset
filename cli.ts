import { existsSync, readFileSync } from 'fs'
import { extract_lines } from '@beenotung/tslib/string'
import { closeBrowser, collectByKeyword, config } from './collect'
import { Keyword, proxy } from './proxy'
import { find } from 'better-sqlite3-proxy'

function parseArguments() {
  let keywords: string[] = []
  let args = process.argv
  for (let i = 2; i < args.length; i++) {
    let arg = args[i]
    let next = args[i + 1]
    switch (arg) {
      case '--listFile': {
        if (!next) {
          console.error('Error: missing file path after --listFile')
          process.exit(1)
        }
        keywords.push(...readListFile(next))
        i++
        break
      }
      case '--keyword': {
        keywords.push(next)
        i++
        break
      }
      case '--downloadDir': {
        if (!next) {
          console.error('Error: missing directory path after --downloadDir')
          process.exit(1)
        }
        config.rootDir = next
        i++
        break
      }
      default: {
        console.error('Error: unknown argument: ' + JSON.stringify(arg))
        process.exit(1)
      }
    }
  }
  if (keywords.length == 0) {
    console.error('Error: missing keywords')
    console.error('Either specify with --listFile or --keyword')
    process.exit(1)
  }
  return { keywords }
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

async function main() {
  let args = parseArguments()

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

main().catch(e => console.error(e))
