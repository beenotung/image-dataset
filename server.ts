import express from 'express'
import { print } from 'listening-on'
import { main as train } from './train'
import { main as retrain } from './retrain'
import { main as classify } from './classify'
import { main as unclassify } from './unclassify'
import { join } from 'path'
import { readdir, rename } from 'fs/promises'
import { datasetCache, modelsCache } from './cache'

let app = express()

app.use('/data-template', express.static('node_modules/data-template'))
app.use('/classified', express.static('classified'))
app.use(express.static('public'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

/***********/
/* actions */
/***********/

let actions = {
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
  let filenames = await readdir(dir)
  let total = 0
  for (let filename of filenames) {
    total += await countDirFiles(join(dir, filename))
  }
  return total
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

app.get('/classified', async (req, res) => {
  res.json({ classes: await scanDir2Files('classified') })
})

app.post('/classified/correct', async (req, res) => {
  try {
    let { className, images } = req.body
    for (let image of images) {
      let srcFile = join('classified', image.className, image.filename)
      let destFile = join('dataset', className, image.filename)
      await rename(srcFile, destFile)
    }
    res.json({})
  } catch (error) {
    res.json({ error: String(error) })
  }
})

let port = 8100
app.listen(port, () => {
  print(port)
})
