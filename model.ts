import { mkdirSync } from 'fs'
import { join } from 'path'
import {
  PreTrainedImageModels,
  loadImageClassifierModel,
  loadImageModel,
} from 'tensorflow-helpers'

export let classNames: string[] = ['others', 'girl', 'boy', 'both']

for (let className of classNames) {
  mkdirSync(join('dataset', className), { recursive: true })
}

export async function loadModels() {
  let imageModelSpec = PreTrainedImageModels.mobilenet['mobilenet-v3-large-100']
  let baseModel = await loadImageModel({
    dir: './saved_models/base_model',
    spec: imageModelSpec,
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
