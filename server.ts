import express from 'express'
import { print } from 'listening-on'
import { main as train } from './train'
import { main as retrain } from './retrain'
import { main as classify, stopClassify } from './classify'
import {
  restoreUnclassified,
  main as unclassifyAll,
  unclassifyDir,
} from './unclassify'
import { main as renameByContentHash } from './rename-by-content-hash'
import { basename, join } from 'path'
import { rename } from 'fs/promises'
import { getDirFilenames, getDirFilenamesSync } from '@beenotung/tslib/fs'
import { datasetCache, modelsCache } from './cache'
import { ClassificationResult, topClassifyResult } from 'tensorflow-helpers'
import { groupBy } from '@beenotung/tslib/functional'
import { env } from './env'
import { resolveFile } from './file'
import { mkdirSync } from 'fs'
import { startTimer } from '@beenotung/tslib/timer'
import { SECOND } from '@beenotung/tslib/time'
import { later } from '@beenotung/tslib/async/wait'
import { compare } from '@beenotung/tslib/compare'
import { config } from './config'
import { getClassNames, updateClassLabels, getClassLabelsInfo } from './model'
import { Server } from 'http'

let app = express()

mkdirSync('downloaded', { recursive: true })
mkdirSync('dataset', { recursive: true })
mkdirSync('classified', { recursive: true })
mkdirSync('unclassified', { recursive: true })

app.use(
  '/data-template',
  express.static(resolveFile('node_modules/data-template')),
)
app.use(
  '/heatmap-helpers/bundle.js',
  express.static(resolveFile('node_modules/heatmap-helpers/bundle.js')),
)
app.use('/ionicons', express.static(resolveFile('node_modules/ionicons')))
app.use('/downloaded', express.static(config.downloadedRootDir))
app.use('/dataset', express.static(config.datasetRootDir))
app.use('/classified', express.static(config.classifiedRootDir))
app.use('/unclassified', express.static(config.unclassifiedRootDir))
app.use('/saved_models/base_model', express.static(config.baseModelDir))
app.use(
  '/saved_models/classifier_model',
  express.static(config.classifierModelDir),
)
app.use(express.static(resolveFile('public')))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

/***********/
/* actions */
/***********/

let actions = {
  renameByContentHash,
  async updateModelSettings(body: {
    complexity: number
    classNames: string[]
  }) {
    stopClassify()
    env.CLASSIFICATION_DIFFICULTY = body.complexity
    await updateClassLabels(body)
    unclassifiedImageCache.clear()
    return modelsCache.load()
  },
  loadModel() {
    unclassifiedImageCache.clear()
    return modelsCache.load()
  },
  loadDataset() {
    stopClassify()
    return datasetCache.load()
  },
  train() {
    stopClassify()
    unclassifiedImageCache.clear()
    return train()
  },
  retrain() {
    stopClassify()
    unclassifiedImageCache.clear()
    return retrain()
  },
  classify,
  unclassifyAll,
}

app.get('/actions', (req, res) => {
  res.json({ actions: Object.keys(actions) })
})

for (let [name, fn] of Object.entries(actions)) {
  app.post('/' + name, async (req, res) => {
    try {
      await fn(req.body)
      res.json({})
    } catch (error) {
      res.json({ error: String(error) })
    }
  })
}

app.post('/unclassify', async (req, res) => {
  try {
    let dir = req.query.dir
    if (!dir || typeof dir != 'string') {
      throw new Error('dir must be given in req.query')
    }
    unclassifyDir(dir)
    res.json({
      total: await countDirFiles('unclassified'),
    })
  } catch (error) {
    res.json({ error: String(error) })
  }
})

app.post('/unclassified/restore', (req, res) => {
  try {
    let json = restoreUnclassified()
    res.json(json)
  } catch (error) {
    res.json({ error: String(error) })
  }
})

/******************/
/* model settings */
/******************/

app.get('/getClassLabelsInfo', async (req, res) => {
  try {
    stopClassify()
    let info = await getClassLabelsInfo()
    unclassifiedImageCache.clear()
    res.json(info)
  } catch (error) {
    res.json({ error: String(error) })
  }
})

app.post('/updateModelSettings', async (req, res) => {
  try {
    let { complexity, classNames } = req.body
    if (!(complexity >= 1 && complexity <= 5)) {
      throw new Error('Complexity must be between 1 and 5')
    }
    if (!Array.isArray(classNames) || classNames.length < 2) {
      throw new Error('At least two class names are required')
    }
    await actions.updateModelSettings({ complexity, classNames })
    res.json({})
  } catch (error) {
    res.json({ error: String(error) })
  }
})

/*********/
/* stats */
/*********/

async function countDirFiles(dir: string) {
  let filenames = await getDirFilenames(dir)
  return filenames.length
}

async function countDir2Files(dir: string) {
  let dirnames = await getDirFilenames(dir)
  return Promise.all(
    dirnames.map(async dirname => ({
      dirname,
      count: await countDirFiles(join(dir, dirname)),
    })),
  )
}

app.get('/stats', async (req, res) => {
  res.json({
    stats: {
      classNames: getClassNames({ fallback: [] }),
      dataset: await countDir2Files(config.datasetRootDir),
      classified: await countDir2Files(config.classifiedRootDir),
      downloaded: await countDir2Files(config.downloadedRootDir),
      unclassified: await countDirFiles(config.unclassifiedRootDir),
    },
  })
})

/************/
/* classify */
/************/

async function scanDir2Files(dir: string) {
  let classNames = await getDirFilenames(dir)
  return Promise.all(
    classNames.map(async className => {
      return {
        className,
        filenames: await getDirFilenames(join(dir, className)),
      }
    }),
  )
}

let isClassifying = false

type UnclassifiedImage = {
  filename: string
  label: string
  confidence: number
  results: ClassificationResult[]
}
let unclassifiedImageCache = new Map<string, UnclassifiedImage>()

app.get('/unclassified', async (req, res) => {
  let hasSentResponse = false
  try {
    let { baseModel, classifierModel, metadata } = await modelsCache.get()
    let epochs = metadata.epochs

    let images: UnclassifiedImage[] = []

    let filenames = await getDirFilenames('unclassified')
    filenames = filenames.filter(
      name => !name.endsWith('.txt') && !name.endsWith('.log'),
    )
    let newFilenames: string[] = []

    let deadlineTimeout = 3 * SECOND
    let deadline = Date.now() + deadlineTimeout

    let timer = startTimer('load unclassified (cached)')
    timer.setEstimateProgress(filenames.length)
    for (let filename of filenames) {
      if (metadata.epochs != epochs) break
      let image = unclassifiedImageCache.get(filename)
      if (image) {
        images.push(image)
      } else {
        newFilenames.push(filename)
      }
      timer.tick()
    }

    if (isClassifying) {
      sendResponse()
      return
    }
    isClassifying = true

    timer.next('load unclassified (uncached)')
    timer.setEstimateProgress(newFilenames.length)
    for (let filename of newFilenames) {
      if (metadata.epochs != epochs) return
      let file = join('unclassified', filename)
      let results = await classifierModel.classifyImageFile(file)
      let result = topClassifyResult(results)
      let image: UnclassifiedImage = {
        filename,
        label: result.label,
        confidence: result.confidence,
        results,
      }
      unclassifiedImageCache.set(filename, image)
      images.push(image)
      if (!hasSentResponse && Date.now() >= deadline) {
        sendResponse()
      }
      timer.tick()
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
        ).sort((a, b) => compare(a.className, b.className)),
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
      unclassifiedImageCache.delete(filename)
      let destFile = join('dataset', className, filename)
      await rename(srcFile, destFile)
    }
    res.json({})
  } catch (error) {
    res.json({ error: String(error) })
  }
})

app.post('/undo', async (req, res) => {
  try {
    let { className, images } = req.body
    for (let destFile of images) {
      destFile = join('.', destFile)
      if (
        !!destFile.startsWith('classified/') &&
        !!destFile.startsWith('unclassified/')
      ) {
        continue
      }
      let filename = basename(destFile)
      let srcFile = join('dataset', className, filename)
      await rename(srcFile, destFile)
    }
    res.json({})
  } catch (error) {
    res.json({ error: String(error) })
  }
})

/*************/
/* benchmark */
/*************/

app.get('/benchmark/labels', async (req, res) => {
  let { classifierModel } = await modelsCache.get()
  res.json({ labels: classifierModel.classNames })
})

app.get('/benchmark/images', async (req, res) => {
  try {
    let images: string[] = []
    async function scanLabelDir(subdir: string, prefix: string) {
      let filenames = await getDirFilenames(subdir)
      for (let filename of filenames) {
        let url = `${prefix}/${filename}`
        images.push(url)
      }
    }
    async function scanLabelsDir(dir: string, prefix: string) {
      let labels = await getDirFilenames(dir)
      for (let label of labels) {
        let subdir = join(dir, label)
        await scanLabelDir(subdir, `${prefix}/${label}`)
      }
    }
    await scanLabelsDir(config.downloadedRootDir, 'downloaded')
    await scanLabelsDir(config.classifiedRootDir, 'classified')
    await scanLabelsDir(config.datasetRootDir, 'dataset')
    await scanLabelDir(config.unclassifiedRootDir, 'unclassified')
    res.json({ images })
  } catch (error) {
    res.json({ error: String(error) })
  }
})

export function startServer(port: number) {
  return new Promise<Server>((resolve, reject) => {
    let server = app.listen(port, () => {
      print(port)
      resolve(server)
    })
    app.on('error', error => {
      reject(error)
    })
  })
}

if (basename(process.argv[1]) == basename(__filename)) {
  startServer(env.PORT)
}
