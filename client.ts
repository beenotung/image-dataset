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

async function benchmark() {
  console.log('[benchmark] start')

  console.log('[benchmark] loading labels...')
  let labels
  {
    let res = await fetch('/benchmark/labels')
    let json = await res.json()
    labels = json.labels
    console.log({ labels })
  }

  console.log('[benchmark] loading images...')
  let images = []
  {
    let res = await fetch('/benchmark/images')
    let json = await res.json()
    for (let url of json.images) {
      let image = new Image()
      await new Promise((resolve, reject) => {
        image.src = url
        image.onload = resolve
        image.onerror = () => {
          reject(`Failed to load image: ${url}`)
        }
      })
      images.push(image)
    }
    console.log({ images })
  }

  console.log('[benchmark] loading models...')
  let classifierModel = await loadModels({ classNames: labels })
  console.log({ classifierModel })

  console.log('[benchmark] warm up model...')
  let n = 5
  let i = 0
  for (let image of images) {
    let result = await classifierModel.classifyImage(image)
    i++
    document.body.textContent = `warm up ${i}/${n} images`
    if (i >= 5) {
      break
    }
  }

  console.log('[benchmark] classifying images...')
  document.body.textContent = `classifying ${images.length} images...`
  n = images.length
  i = 0
  let startTime = performance.now()
  for (let image of images) {
    let result = await classifierModel.classifyImage(image)
    i++
  }
  let endTime = performance.now()
  let duration = endTime - startTime
  let seconds = duration / 1000
  document.body.innerHTML = /* html */ `
  <p>classified ${n} images</p>
  <p>total time used: ${seconds}s</p>
  <p>images per second: ${n / seconds}</p>
  <p>ms per image: ${duration / n}</p>
  `
  return {
    images_count: n,
    total_seconds_used: seconds,
    images_per_second: n / seconds,
    ms_per_image: duration / n,
  }
}

Object.assign(window, {
  loadModels,
  tf,
  cropAndResizeImageTensor,
  toTensor3D,
  benchmark,
})
