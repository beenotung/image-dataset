import { mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  PreTrainedImageModels,
  loadImageClassifierModel,
  loadImageModel,
} from 'tensorflow-helpers'

mkdirSync('dataset', { recursive: true })

export let classNames: string[] = readdirSync('dataset')

if (classNames.length == 0) {
  console.error('Error: no class names found in dataset directory')
  console.error('Example: others, cat, dog, both')
  process.exit(1)
}

export function setClassNames(names: string[]) {
  classNames.length = 0
  for (let className of names) {
    mkdirSync(join('dataset', className), { recursive: true })
    classNames.push(className)
  }
}

export async function loadModels() {
  let imageModelSpec = PreTrainedImageModels.mobilenet['mobilenet-v3-large-100']
  let { db } = await import('./db')

  let select_embedding = db
    .prepare<string, string | null>(
      /* sql */ `select embedding from image where filename = ?`,
    )
    .pluck()
  let update_embedding = db.prepare<
    { embedding: string; filename: string },
    string | null
  >(
    /* sql */ `update image set embedding = :embedding where filename = :filename`,
  )
  let insert_embedding = db.prepare<
    { embedding: string; filename: string },
    string | null
  >(
    /* sql */ `insert into image (filename, embedding) values (:filename, :embedding)`,
  )

  let baseModel = await loadImageModel({
    dir: './saved_models/base_model',
    spec: imageModelSpec,
    cache: {
      get(filename) {
        let embedding = select_embedding.get(filename)
        if (!embedding) return null
        return embedding.split(',').map(s => +s)
      },
      set(filename, values) {
        let embedding = values.join(',')
        if (update_embedding.run({ filename, embedding }).changes == 1) {
          return
        }
        insert_embedding.run({ filename, embedding })
      },
    },
  })
  let classifierModel = await loadImageClassifierModel({
    modelDir: './saved_models/classifier_model',
    datasetDir: './dataset',
    baseModel,
    classNames,
    hiddenLayers: [imageModelSpec.features],
  })
  return { baseModel, classifierModel }
}
