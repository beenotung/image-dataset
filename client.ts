import {
  loadImageModel,
  PreTrainedImageModels,
  loadImageClassifierModel,
  cropAndResizeImageTensor,
  toTensor3D,
  getImageFeatures,
  ImageModel,
} from 'tensorflow-helpers/browser'
import * as tf from '@tensorflow/tfjs-core'
import { heatmap_schemes, generate_heatmap_values } from 'heatmap-values'

async function loadModels(args: { classNames: string[] }) {
  let baseModel = await loadImageModel({
    url: '/saved_models/base_model',
    cacheUrl: 'indexeddb://base_model',
  })

  let classifierModel = await loadImageClassifierModel({
    baseModel,
    modelUrl: '/saved_models/classifier_model',
    cacheUrl: 'indexeddb://classifier_model',
    checkForUpdates: true,
    classNames: args.classNames,
  })

  let input = tf.zeros([1, 224, 224, 3])
  let x = tf.variable(input)
  tf.tidy(() => {
    debugger
    const tape = tf.grad((x) => {
      let embedding = baseModel.model.predict(x) as tf.Tensor
      //above unchanged
      //can check difference between tf.grad and tf.variablegrads
      let y = classifierModel.classifierModel.predict(embedding) as tf.Tensor
      return y
    })
    let z = tape(x)
    //   tape.watch(x);
    // let embedding = baseModel.model.predict(x) as tf.Tensor
    // let y = classifierModel.classifierModel.predict(embedding)
    //   const dy_dx = tape.gradient(y, x);
    //   dy_dx.print();
    //   return dy_dx
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

async function heatMap(image: HTMLImageElement) {
  let classifierModel = await loadModels({
    classNames: ['others', 'cat', 'dog', 'human'],
  })
  classifierModel.baseModel.model
  classifierModel.classifierModel

  let heatmapCanvas = document.createElement('canvas')
  heatmapCanvas.width = image.width
  heatmapCanvas.height = image.height
  let heatmapContext = heatmapCanvas.getContext('2d')!
  let heatmap_colors = generate_heatmap_values(
    heatmap_schemes.red_transparent_blue,
  )
  let features = await getImageFeatures({
    tf,
    imageModel: classifierModel.baseModel,
    image,
  })

  // [1 x 7 x 7 x 160]
  let data = (await features.spatialFeatures.array()) as number[][][][]

  heatmapContext.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height)

  let map = data[0]
  let ROW = map.length
  let COL = map[0].length
  let FEATURE = map[0][0].length
  // FEATURE = 1

  let min = map[0][0][0]
  let max = map[0][0][0]

  for (let row = 0; row < ROW; row++) {
    for (let col = 0; col < COL; col++) {
      let value = 0
      for (let feature_index = 0; feature_index < FEATURE; feature_index++) {
        value += Math.abs(map[row][col][feature_index])
      }
      if (value < min) {
        min = value
      }
      if (value > max) {
        max = value
      }
    }
  }

  for (let row = 0; row < ROW; row++) {
    for (let col = 0; col < COL; col++) {
      let value = 0
      for (let feature_index = 0; feature_index < FEATURE; feature_index++) {
        value += Math.abs(map[row][col][feature_index])
      }
      value = (value - min) / (max - min)
      let color = heatmap_colors[Math.floor(value * 255)]
      heatmapContext.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`
      // heatmapContext.fillStyle = `rgba(255, 0, 0, ${value})`
      let left = (col / COL) * heatmapCanvas.width
      let top = (row / ROW) * heatmapCanvas.height
      let height = (1 / ROW) * heatmapCanvas.height
      let width = (1 / COL) * heatmapCanvas.width
      heatmapContext.fillRect(left, top, width, height)
    }
  }

  return heatmapCanvas
}

Object.assign(window, {
  loadModels,
  tf,
  cropAndResizeImageTensor,
  toTensor3D,
  benchmark,
  heatMap,
})
