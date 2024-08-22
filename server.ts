import express from 'express'
import { print } from 'listening-on'
import { main as train } from './train'
import { main as retrain } from './retrain'
import { main as classify } from './classify'
import { main as unclassify } from './unclassify'
import { main as renameByContentHash } from './rename-by-content-hash'
import { basename, join } from 'path'
import { readdir, rename } from 'fs/promises'
import { datasetCache, modelsCache } from './cache'
import * as tf from '@tensorflow/tfjs-node'
import {
  toOneTensor,
  mapWithClassName,
  ClassificationResult,
  topClassifyResult,
} from 'tensorflow-helpers'
import { groupBy } from '@beenotung/tslib/functional'
import { env } from './env'
import { resolveFile } from './file'
import { mkdirSync } from 'fs'
import { startTimer } from '@beenotung/tslib/timer'
import { SECOND } from '@beenotung/tslib/time'
import { later } from '@beenotung/tslib/async/wait'

let app = express()

mkdirSync('dataset', { recursive: true })
mkdirSync('classified', { recursive: true })
mkdirSync('unclassified', { recursive: true })

app.use(
  '/data-template',
  express.static(resolveFile('node_modules/data-template')),
)
app.use('/classified', express.static('classified'))
app.use('/unclassified', express.static('unclassified'))
app.use(express.static(resolveFile('public')))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

/***********/
/* actions */
/***********/

let actions = {
  renameByContentHash,
  loadModel: modelsCache.load,
  loadDataset: datasetCache.load,
  train,
  retrain,
  classify,
  unclassify,
}

app.get('/actions', (req, res) => {
  res.json({ actions: Object.keys(actions) })
})

for (let [name, fn] of Object.entries(actions)) {
  app.post('/' + name, async (req, res) => {
    try {
      await fn()
      res.json({})
    } catch (error) {
      res.json({ error: String(error) })
    }
  })
}

/*********/
/* stats */
/*********/

async function countDirFiles(dir: string) {
  let filenames = await readdir(dir)
  return filenames.length
}

async function countDir2Files(dir: string) {
  let classNames = await readdir(dir)
  return Promise.all(
    classNames.map(async className => ({
      className,
      count: await countDirFiles(join(dir, className)),
    })),
  )
}

app.get('/stats', async (req, res) => {
  res.json({
    stats: {
      dataset: await countDir2Files('dataset'),
      classified: await countDir2Files('classified'),
      unclassified: await countDirFiles('unclassified'),
    },
  })
})

/************/
/* classify */
/************/

async function scanDir2Files(dir: string) {
  let classNames = await readdir(dir)
  return Promise.all(
    classNames.map(async className => {
      return {
        className,
        filenames: await readdir(join(dir, className)),
      }
    }),
  )
}

let isClassifying = false

app.get('/unclassified', async (req, res) => {
  let hasSentResponse = false
  try {
    let { embeddingCache, baseModel, classifierModel } = await modelsCache.get()
    let images: {
      filename: string
      label: string
      confidence: number
      results: ClassificationResult[]
    }[] = []

    async function addImage(filename: string) {
      let file = join('unclassified', filename)
      let embedding = await baseModel.imageFileToEmbedding(file)
      let tensors = tf.tidy(() =>
        toOneTensor(classifierModel.classifierModel.predict(embedding)),
      )
      let values = await tensors.data()
      let results = mapWithClassName(classifierModel.classNames, values)
      let result = topClassifyResult(results)
      images.push({
        filename,
        label: result.label,
        confidence: result.confidence,
        results,
      })
    }

    let filenames = await readdir('unclassified')
    let newFilenames: string[] = []

    let deadlineTimeout = 3 * SECOND
    let deadline = Date.now() + deadlineTimeout

    let timer = startTimer('load unclassified (cached)')
    timer.setEstimateProgress(filenames.length)
    for (let filename of filenames) {
      if (!embeddingCache.has(filename)) {
        newFilenames.push(filename)
        continue
      }
      await addImage(filename)
      timer.tick()
      if (!hasSentResponse && Date.now() >= deadline) {
        sendResponse()
      }
      await later(0)
    }

    if (isClassifying) {
      sendResponse()
      return
    }
    isClassifying = true

    timer.next('load unclassified (uncached)')
    timer.setEstimateProgress(newFilenames.length)
    for (let filename of newFilenames) {
      await addImage(filename)
      timer.tick()
      if (!hasSentResponse && Date.now() >= deadline) {
        sendResponse()
      }
      await later(0)
    }
    timer.end()

    sendResponse()

    function sendResponse() {
      if (hasSentResponse) {
        return
      }
      hasSentResponse = true
      res.json({
        classes: Array.from(
          groupBy(image => image.label, images).entries(),
          ([className, images]) => ({
            className,
            images,
          }),
        ),
      })
    }
  } catch (error) {
    console.error(error)
    if (!hasSentResponse) {
      res.json({ error: String(error) })
    }
  } finally {
    isClassifying = false
  }
})

app.get('/classified', async (req, res) => {
  res.json({ classes: await scanDir2Files('classified') })
})

app.post('/correct', async (req, res) => {
  try {
    let { className, images } = req.body
    for (let srcFile of images) {
      srcFile = join('.', srcFile)
      if (
        !!srcFile.startsWith('classified/') &&
        !!srcFile.startsWith('unclassified/')
      ) {
        continue
      }
      let filename = basename(srcFile)
      let destFile = join('dataset', className, filename)
      await rename(srcFile, destFile)
    }
    res.json({})
  } catch (error) {
    res.json({ error: String(error) })
  }
})

export function startServer(port: number) {
  app.listen(port, () => {
    print(port)
  })
}

if (basename(process.argv[1]) == basename(__filename)) {
  startServer(env.PORT)
}
