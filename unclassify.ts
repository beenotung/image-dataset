import { mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { getDirFilenamesSync } from '@beenotung/tslib/fs'
import { ProgressCli } from '@beenotung/tslib/progress-cli'
import { find } from 'better-sqlite3-proxy'
import { proxy } from './proxy'
import { config } from './config'

export function unclassifyDir(dir: string) {
  console.log('unclassifyDir:', [dir])
  let filenames = getDirFilenamesSync(dir)
  for (let filename of filenames) {
    let srcFile = join(dir, filename)
    let destFile = join(config.unclassifiedRootDir, filename)
    renameSync(srcFile, destFile)
  }
}

export function restoreUnclassified() {
  console.log('restored unclassified images to downloaded directory...')
  let cli = new ProgressCli()
  let filenames = getDirFilenamesSync(config.unclassifiedRootDir)
  let unknownCount = 0
  let restoredCount = 0
  for (let keyword of proxy.keyword) {
    let dir = join(config.downloadedRootDir, keyword.keyword)
    mkdirSync(dir, { recursive: true })
  }
  for (let filename of filenames) {
    let srcFile = join(config.unclassifiedRootDir, filename)
    let image = find(proxy.image, { filename })
    let keyword = image?.keyword?.keyword
    if (!keyword) {
      unknownCount++
      cli.update(`restored: ${restoredCount}, unknown: ${unknownCount} ...`)
      continue
    }
    let destFile = join(config.downloadedRootDir, keyword, filename)
    renameSync(srcFile, destFile)
    restoredCount++
    cli.update(`restored: ${restoredCount}, unknown: ${unknownCount} ...`)
  }
  cli.update(`restored: ${restoredCount}, unknown: ${unknownCount}`)
  cli.nextLine()
  console.log('done.')
  return { restoredCount, unknownCount }
}

export function main() {
  mkdirSync(config.unclassifiedRootDir, { recursive: true })
  mkdirSync(config.classifiedRootDir, { recursive: true })
  let classNames = getDirFilenamesSync(config.classifiedRootDir)
  for (let className of classNames) {
    unclassifyDir(join(config.classifiedRootDir, className))
  }
}

if (process.argv[1] == __filename) {
  main()
}
