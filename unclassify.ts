import { mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { getDirFilenamesSync } from '@beenotung/tslib/fs'

let unclassifiedDir = 'unclassified'
let classifiedDir = 'classified'

export function unclassifyDir(dir: string) {
  let filenames = getDirFilenamesSync(dir)
  for (let filename of filenames) {
    let srcFile = join(dir, filename)
    let destFile = join(unclassifiedDir, filename)
    renameSync(srcFile, destFile)
  }
}

export function main() {
  mkdirSync(unclassifiedDir, { recursive: true })
  mkdirSync(classifiedDir, { recursive: true })
  let classNames = getDirFilenamesSync(classifiedDir)
  for (let className of classNames) {
    unclassifyDir(join(classifiedDir, className))
  }
}

if (process.argv[1] == __filename) {
  main()
}
