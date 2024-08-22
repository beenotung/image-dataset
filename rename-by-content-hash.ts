import { readdir } from 'fs/promises'
import { join } from 'path'
import { scanDir } from 'tensorflow-helpers'

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

if (process.argv[1] == __filename) {
  main()
}
