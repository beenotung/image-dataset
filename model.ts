import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
} from 'fs'
import { join } from 'path'
import { getDirFilenames, getDirFilenamesSync } from '@beenotung/tslib/fs'
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
import { readdir, stat, writeFile } from 'fs/promises'

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
  let metadata = loadClassifierModelMetadata(config.classifierModelDir)

  createClassNameDirectories(config.datasetRootDir, classNames)
  createClassNameDirectories(config.classifiedRootDir, classNames)

  return {
    embeddingCache,
    baseModel,
    classifierModel,
    metadata,
  }
}

function loadClassifierModelMetadata(dir: string) {
  let file = join(dir, 'metadata.json')
  let epochs = 0
  try {
    let text = readFileSync(file, 'utf8')
    let json = JSON.parse(text)
    epochs = json.epochs || 0
  } catch (error) {
    // missing file or invalid json
  }
  return {
    epochs,
  }
}

export async function saveClassifierModelMetadata(
  dir: string,
  metadata: { epochs: number },
) {
  let file = join(dir, 'metadata.json')
  let text = JSON.stringify(metadata, null, 2)
  await writeFile(file, text, 'utf8')
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
  classNames = await askClassNames('input class names: ')
  for (let className of classNames) {
    mkdirSync(join(config.datasetRootDir, className), { recursive: true })
  }
}

async function askClassNames(question: string) {
  while (true) {
    let input = await ask(question)
    let classNames = input.split(',').map(name => name.trim())
    if (classNames.length > 1) {
      return classNames
    }
    console.log('warning: at least two class names are needed')
  }
}

async function getDirFilenamesRecur(dir: string): Promise<string[]> {
  let filenames = (await getDirFilenames(dir)).filter(
    name => !name.endsWith('.txt') && !name.endsWith('.log')
  );
  let targets: string[] = [];

  for (const filename of filenames) {
    let path = join(dir, filename);

    if ((await stat(path)).isDirectory()) {
      targets = targets.concat(await getDirFilenamesRecur(path));
    } else {
      targets.push(path);
    }
  }
  return targets;
}

export async function getClassLabelsInfo() {
  let classNames = getClassNames({ fallback: [] })
  return {
    classNames,
    complexity: env.CLASSIFICATION_DIFFICULTY,
  }
}

export async function getDataRatio() {
  let num_of_training = (await getDirFilenamesRecur(config.datasetRootDir)).length
  let num_of_validation = (await getDirFilenamesRecur(config.validationRootDir)).length

  //rd off to % with 2 decimal places 
  let dataRatio = Math.round(num_of_training / (num_of_training + num_of_validation) * 10000) /100
  return { dataRatio }
}

export async function updateClassLabels(body: { classNames: string[] }) {
  let existingClassNames = getClassNames({ fallback: [] })
  let newClassNames = body.classNames
  let classesToRemove = existingClassNames.filter(
    className => !newClassNames.includes(className),
  )

  // check if there are same samples in removed classes
  let hasFiles = false
  let rootDirs = [config.datasetRootDir, config.classifiedRootDir]
  for (let rootDir of rootDirs) {
    for (let className of classesToRemove) {
      let dir = join(rootDir, className)
      let files = existsSync(dir) ? readdirSync(dir).length : 0
      if (files > 0) {
        console.log(`warning: ${dir} is not empty`)
        hasFiles = true
      }
    }
  }
  if (hasFiles) {
    throw new Error(
      'Cannot update labels: Some classes to be removed still contain images',
    )
  }

  // remove directories for removed class names
  for (let rootDir of rootDirs) {
    for (let className of classesToRemove) {
      let dir = join(rootDir, className)
      if (existsSync(dir)) {
        rmdirSync(dir)
      }
    }
  }

  // remove classifier model
  if (existsSync(config.classifierModelDir)) {
    rmdirSync(config.classifierModelDir, { recursive: true })
  }

  // create directories for new class names
  for (let className of newClassNames) {
    mkdirSync(join(config.classifiedRootDir, className), { recursive: true })
  }
}

export async function updateDataRatio(body: { ratio: number }) {
  let newRatio = body.ratio

  let num_of_training = (await getDirFilenamesRecur(config.datasetRootDir)).length
  let num_of_validation = (await getDirFilenamesRecur(config.validationRootDir)).length
  let total_num = num_of_training + num_of_validation
  let num_to_move_to_training = Math.round(total_num * newRatio) - num_of_training
  //TODO function to move files
}