import { mkdirSync, readdirSync, renameSync } from 'fs'
import { join } from 'path'

let unclassifiedDir = 'unclassified'
let classifiedDir = 'classified'

export function main() {
  mkdirSync(unclassifiedDir, { recursive: true })
  mkdirSync(classifiedDir, { recursive: true })
  let classNames = readdirSync(classifiedDir)
  for (let className of classNames) {
    let filenames = readdirSync(join(classifiedDir, className))
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
