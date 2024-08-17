import { mkdirSync } from 'fs'
import { loadModels } from './model'
import { readdir, rename } from 'fs/promises'
import { join } from 'path'
import { topClassifyResult } from 'tensorflow-helpers'

let unclassifiedDir = 'unclassified'
let classifiedDir = 'classified'

mkdirSync(unclassifiedDir, { recursive: true })
mkdirSync(classifiedDir, { recursive: true })

export async function main() {
  let { classifierModel } = await loadModels()
  let filenames = await readdir(unclassifiedDir)
  for (let filename of filenames) {
    let src = join(unclassifiedDir, filename)
    let result = await classifierModel.classifyAsync(src)
    let className = topClassifyResult(result).label
    let dest = join(classifiedDir, className)
    await rename(src, dest)
    console.log({ filename, result })
  }
}

if (process.argv[1] == __filename) {
  main()
}
