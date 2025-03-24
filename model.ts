import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { getDirFilenamesSync } from '@beenotung/tslib/fs'
import {
  ModelArtifactsWithClassNames,
  PreTrainedImageModels,
  loadImageClassifierModel,
  loadImageModel,
  calcHiddenLayerSize,
} from 'tensorflow-helpers'
import { config } from './config'
import { ask } from 'npm-init-helper'
import { env } from './env'

export function getClassNames(options?: { fallback?: string[] }): string[] {
  let modelFile = join(config.classifierModelDir, 'model.json')
  if (existsSync(modelFile)) {
    let json: ModelArtifactsWithClassNames = JSON.parse(
      readFileSync(modelFile, 'utf8'),
    )
    if (json.classNames) {
      return json.classNames
    }
  }

  let classNames = new Set<string>()

  function checkDir(dir: string) {
    if (!existsSync(dir)) {
      return
    }
    for (let className of getDirFilenamesSync(dir)) {
      classNames.add(className)
    }
  }
  checkDir(config.datasetRootDir)
  checkDir(config.classifiedRootDir)

  if (classNames.size == 0) {
    if (options?.fallback) {
      return options.fallback
    }
    throw new Error(
      'no class names found in dataset nor classified directory. Example: others, cat, dog, both',
    )
  }

  return Array.from(classNames)
}

function createClassNameDirectories(dir: string, classNames: string[]) {
  let existingClassNames = existsSync(dir) ? getDirFilenamesSync(dir) : []

  for (let className of classNames) {
    if (existingClassNames.includes(className)) {
      continue
    }
    mkdirSync(join(dir, className), { recursive: true })
  }

  for (let className of existingClassNames) {
    if (classNames.includes(className)) {
      continue
    }
    let file = join(dir, className)
    let stat = statSync(file)
    if (stat.isDirectory()) {
      file = JSON.stringify(file)
      console.warn(
        `Warning: extra directory ${file} does not exist in classNames`,
      )
    }
  }
}

export async function loadModels() {
  let classNames = getClassNames()

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
    dir: config.baseModelDir,
    spec: imageModelSpec,
    cache: embeddingCache,
  })
  let classifierModel = await loadImageClassifierModel({
    modelDir: config.classifierModelDir,
    datasetDir: config.datasetRootDir,
    baseModel,
    classNames,
    hiddenLayers: [
      calcHiddenLayerSize({
        inputSize: imageModelSpec.features,
        outputSize: classNames.length,
        difficulty: env.CLASSIFICATION_DIFFICULTY,
      }),
    ],
  })

  createClassNameDirectories(config.datasetRootDir, classNames)
  createClassNameDirectories(config.classifiedRootDir, classNames)

  return {
    embeddingCache,
    baseModel,
    classifierModel,
  }
}

export async function initClassNames() {
  let classNames = getClassNames({ fallback: [] })
  if (classNames.length > 1) {
    console.log('loaded class names:', classNames)
    return
  }

  console.log()
  console.log('no class names found in dataset or classified directory.')
  console.log('example: others, cat, dog, both')
  while (classNames.length <= 1) {
    let input = await ask('input class names: ')
    classNames = input.split(',').map(name => name.trim())
    if (classNames.length > 1) {
      for (let className of classNames) {
        mkdirSync(join(config.datasetRootDir, className), { recursive: true })
      }
      return
    }
    console.log('warning: at least two class names are needed')
  }
}
