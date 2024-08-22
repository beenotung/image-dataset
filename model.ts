import { mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  PreTrainedImageModels,
  loadImageClassifierModel,
  loadImageModel,
} from 'tensorflow-helpers'

function createClassNameDirectories(dir: string, classNames: string[]) {
  for (let className of classNames) {
    mkdirSync(join(dir, className), { recursive: true })
  }
}

export function getClassNames(): string[] {
  mkdirSync('dataset', { recursive: true })
  let classNames: string[] = readdirSync('dataset')
  if (classNames.length == 0) {
    console.error('Error: no class names found in dataset directory')
    console.error('Example: others, cat, dog, both')
    process.exit(1)
  }
  return classNames
}

export async function loadModels() {
  let classNames = getClassNames()

  createClassNameDirectories('dataset', classNames)
  createClassNameDirectories('classified', classNames)

  let imageModelSpec = PreTrainedImageModels.mobilenet['mobilenet-v3-large-100']
  let { db } = await import('./db')

  let has_embedding = db
    .prepare<string, number>(
      /* sql */ `select (case when embedding is null then 0 else 1 end) as count from image where filename = ?`,
    )
    .pluck()
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
  let select_cached_images = db
    .prepare<void[], string>(
      /* sql */ `
  select filename from image where embedding is not null
  `,
    )
    .pluck()

  let embeddingCache = {
    keys(): string[] {
      return select_cached_images.all()
    },
    has(filename: string) {
      return has_embedding.get(filename)! == 1
    },
    get(filename: string) {
      let embedding = select_embedding.get(filename)
      if (!embedding) return null
      return embedding.split(',').map(s => +s)
    },
    set(filename: string, values: number[]) {
      let embedding = values.join(',')
      if (update_embedding.run({ filename, embedding }).changes == 1) {
        return
      }
      insert_embedding.run({ filename, embedding })
    },
  }

  let baseModel = await loadImageModel({
    dir: './saved_models/base_model',
    spec: imageModelSpec,
    cache: embeddingCache,
  })
  let classifierModel = await loadImageClassifierModel({
    modelDir: './saved_models/classifier_model',
    datasetDir: './dataset',
    baseModel,
    classNames,
    hiddenLayers: [imageModelSpec.features],
  })

  return {
    embeddingCache,
    baseModel,
    classifierModel,
  }
}
