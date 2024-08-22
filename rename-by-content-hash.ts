import { readdir } from 'fs/promises'
import { basename, join } from 'path'
import {
  isContentHash,
  renameFileByContentHash,
} from 'tensorflow-helpers/dist/file'
import { db } from './db'
import { startTimer } from '@beenotung/tslib/timer'

export async function main() {
  console.log('rename by content hash: scanning directories...')
  await scanDir2('dataset')
  await scanDir2('classified')
  await scanDir('unclassified')
  console.log('rename by content hash: done.')
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
  filenames = filenames.filter(filename => !isContentHash(filename))
  if (filenames.length == 0) {
    return
  }
  let timer = startTimer('scan dir ' + JSON.stringify(dir))
  timer.setEstimateProgress(filenames.length)
  for (let filename of filenames) {
    let file = join(dir, filename)
    let newFile = await renameFileByContentHash(file)
    let newFilename = basename(newFile)
    rename_image.run({
      new_filename: newFilename,
      old_filename: filename,
    })
    timer.tick()
  }
  timer.end()
}

if (process.argv[1] == __filename) {
  main()
}
