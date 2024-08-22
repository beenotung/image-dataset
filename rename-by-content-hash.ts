import { readdir } from 'fs/promises'
import { basename, join } from 'path'
import { isContentHash, renameFileByContentHash } from 'tensorflow-helpers'
import { db } from './db'

export async function main() {
  await scanDir2('dataset')
  await scanDir2('classified')
  await scanDir('unclassified')
}

async function scanDir2(dir: string) {
  let classNames = await readdir(dir)
  for (let className of classNames) {
    await scanDir(join(dir, className))
  }
}

let rename_image = db.prepare<{
  new_filename: string
  old_filename: string
}>(/* sql */ `
update image
set filename = :new_filename
where filename = :old_filename
`)

async function scanDir(dir: string) {
  let filenames = await readdir(dir)
  for (let filename of filenames) {
    if (isContentHash(filename)) {
      continue
    }
    let file = join(dir, filename)
    let newFile = await renameFileByContentHash(file)
    let newFilename = basename(newFile)
    rename_image.run({
      new_filename: newFilename,
      old_filename: filename,
    })
  }
}

if (process.argv[1] == __filename) {
  main()
}
