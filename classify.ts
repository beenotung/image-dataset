import { mkdirSync } from 'fs'
import { rename } from 'fs/promises'
import { getDirFilenames } from '@beenotung/tslib/fs'
import { join } from 'path'
import { topClassifyResult } from 'tensorflow-helpers'
import { startTimer } from '@beenotung/tslib/timer'
import { modelsCache } from './cache'

let unclassifiedDir = 'unclassified'
let classifiedDir = 'classified'

mkdirSync(unclassifiedDir, { recursive: true })

let running = false

export function stopClassify() {
  running = false
}

export async function main() {
  let timer = startTimer('load models')
  let { classifierModel } = await modelsCache.get()

  timer.next('init directories')
  for (let className of classifierModel.classNames) {
    mkdirSync(join(classifiedDir, className), { recursive: true })
  }

  timer.next('load file list')
  let filenames = await getDirFilenames(unclassifiedDir)

  timer.next('classify images')
  timer.setEstimateProgress(filenames.length)
  running = true
  for (let filename of filenames) {
    if (!running) {
      break
    }
    let src = join(unclassifiedDir, filename)
    let result = await classifierModel.classifyImageFile(src)
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
