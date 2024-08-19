import { mkdirSync } from 'fs'
import { loadModels } from './model'
import { readdir, rename } from 'fs/promises'
import { join } from 'path'
import { topClassifyResult } from 'tensorflow-helpers'
import { startTimer } from '@beenotung/tslib/timer'

let unclassifiedDir = 'unclassified'
let classifiedDir = 'classified'

mkdirSync(unclassifiedDir, { recursive: true })

export async function main() {
  let timer = startTimer('load models')
  let { classifierModel } = await loadModels()

  timer.next('init directories')
  for (let className of classifierModel.classNames) {
    mkdirSync(join(classifiedDir, className), { recursive: true })
  }

  timer.next('load file list')
  let filenames = await readdir(unclassifiedDir)

  timer.next('classify images')
  timer.setEstimateProgress(filenames.length)
  for (let filename of filenames) {
    let src = join(unclassifiedDir, filename)
    let result = await classifierModel.classifyAsync(src)
    let className = topClassifyResult(result).label
    let dest = join(classifiedDir, className, filename)
    await rename(src, dest)
    timer.tick()
  }

  timer.end()
}

if (process.argv[1] == __filename) {
  main()
}
