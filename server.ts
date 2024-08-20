import express from 'express'
import { print } from 'listening-on'
import { main as train } from './train'
import { main as retrain } from './retrain'
import { main as classify } from './classify'
import { main as unclassify } from './unclassify'
import { readdirSync } from 'fs'
import { join } from 'path'

let app = express()

app.use('/data-template', express.static('node_modules/data-template'))
app.use(express.static('public'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

/***********/
/* actions */
/***********/

let actions = { train, retrain, classify, unclassify }

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

function countDirFiles(dir: string) {
  return readdirSync(dir).length
}

function countDir2Files(dir: string) {
  let filenames = readdirSync(dir)
  let total = 0
  for (let filename of filenames) {
    total += countDirFiles(join(dir, filename))
  }
  return total
}

app.get('/stats', (req, res) => {
  res.json({
    stats: {
      dataset: countDir2Files('dataset'),
      classified: countDir2Files('classified'),
      unclassified: countDirFiles('unclassified'),
    },
  })
})

let port = 8100
app.listen(port, () => {
  print(port)
})
