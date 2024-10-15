import { mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { getDirFilenamesSync } from '@beenotung/tslib/fs'

let unclassifiedDir = 'unclassified'
let classifiedDir = 'classified'

export function main() {
  mkdirSync(unclassifiedDir, { recursive: true })
  mkdirSync(classifiedDir, { recursive: true })
  let classNames = getDirFilenamesSync(classifiedDir)
  for (let className of classNames) {
    let filenames = getDirFilenamesSync(join(classifiedDir, className))
    for (let filename of filenames) {
      let srcFile = join(classifiedDir, className, filename)
      let destFile = join(unclassifiedDir, filename)
      renameSync(srcFile, destFile)
    }
  }
}

if (process.argv[1] == __filename) {
  main()
}
