import {
  loadImageModel,
  loadImageClassifierModel,
  tf,
  cropAndResizeImageTensor,
  toTensor3D,
} from 'tensorflow-helpers/browser'

async function loadModels(args: { classNames: string[] }) {
  let baseModel = await loadImageModel({
    url: '/saved_models/base_model',
    cacheUrl: 'indexeddb://base_model',
  })
  tf.browser.toPixels
  let classifierModel = await loadImageClassifierModel({
    baseModel,
    modelUrl: '/saved_models/classifier_model',
    cacheUrl: 'indexeddb://classifier_model',
    checkForUpdates: true,
    classNames: args.classNames,
  })
  return classifierModel
}

Object.assign(window, {
  loadModels,
  tf,
  cropAndResizeImageTensor,
  toTensor3D,
})
