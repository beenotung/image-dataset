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

  // let input = tf.ones([1, 224, 224, 3])
  // let x = tf.variable(input)
  // tf.tidy(() => {
  //   debugger
  //   const tape = tf.grad((x) => {
  //     let embedding = baseModel.model.predict(x) as tf.Tensor
  //     //above unchanged
  //     //can check difference between tf.grad and tf.variablegrads
  //     let y = classifierModel.classifierModel.predict(embedding) as tf.Tensor
  //     return y
  //   })
  //   let z = tape(x)
  //   z.print();
  //   debugger
  //   let canvas=document.createElement('canvas')
  //   canvas.width = 224
  //   canvas.height = 224
  //   let context = canvas.getContext('2d')!
  //   // Draw z (a tf.Tensor) to the canvas
  //   // Assume z is [1, 224, 224, 3] and values are in [0, 1] or [0, 255]
  //   let zData = z.squeeze().arraySync() as number[][][]; // [224, 224, 3]
  //   let imageData = context.createImageData(224, 224);
  //   for (let y = 0; y < 224; y++) {
  //     for (let x = 0; x < 224; x++) {
  //       let idx = (y * 224 + x) * 4;
  //       let pixel = zData[y][x];
  //       imageData.data[idx + 0] = Math.max(0, Math.min(255, Math.round(pixel[0] * 255)));
  //       imageData.data[idx + 1] = Math.max(0, Math.min(255, Math.round(pixel[1] * 255)));
  //       imageData.data[idx + 2] = Math.max(0, Math.min(255, Math.round(pixel[2] * 255)));
  //       imageData.data[idx + 3] = 255;
  //     }
  //   }
  //   context.putImageData(imageData, 0, 0);
  //   document.body.appendChild(canvas)
  // let embedding = baseModel.model.predict(x) as tf.Tensor
  // let y = classifierModel.classifierModel.predict(embedding)
  //   const dy_dx = tf.grad(y)(x);
  //   dy_dx.print();
  //   return dy_dx
  // const composedFunction = (input: tf.Tensor) => {
  //   const baseOutput = baseModel.model.predict(input) as tf.Tensor;
  //   const classOutput = classifierModel.classifierModel.predict(baseOutput) as tf.Tensor;
  //   // Sum both baseOutput and classOutput for gradient calculation
  //   return baseOutput.sum().add(classOutput.sum());
  // };

  //   let gradFunc = tf.grad((input: tf.Tensor) => {
  //     let baseOutput = baseModel.model.predict(input) as tf.Tensor;
  //     let classOutput = classifierModel.classifierModel.predict(baseOutput) as tf.Tensor;
  //     // Return both outputs as an array for tf.grads
  //     return baseOutput.sum().add(classOutput.sum());
  //   });
  //   let inputTensor = tf.tensor(input.arraySync());
  //   let baseGrad = gradFunc(inputTensor);
  //   baseGrad.print();
  // })
  return {
    baseModel,
    classifierModel,
    classifyImage: classifierModel.classifyImage,
  }
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
    let result = await classifierModel.classifierModel.classifyImage(image)
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
    let result = await classifierModel.classifierModel.classifyImage(image)
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
  let container = image.parentElement!.querySelector('.heatmap-container')!
  // debugger
  let { baseModel, classifierModel } = await loadModels({
    classNames: ['others', 'cat', 'dog', 'human'],
  })
  // classifierModel.baseModel.model
  // classifierModel.classifierModel

  let heatmapCanvas = document.createElement('canvas')
  heatmapCanvas.width = image.width
  heatmapCanvas.height = image.height
  let heatmapContext = heatmapCanvas.getContext('2d')!
  let heatmap_colors = generate_heatmap_values(
    // heatmap_schemes.red_transparent_blue,
    heatmap_schemes.red_green_blue,
  )
  // let features = await getImageFeatures({
  //   tf,
  //   imageModel: classifierModel.baseModel,
  //   image,
  // })

  // // [1 x 7 x 7 x 160]
  // let data = (await features.spatialFeatures.array()) as number[][][][]

  // heatmapContext.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height)

  // let map = data[0]
  // let ROW = map.length
  // let COL = map[0].length
  // let FEATURE = map[0][0].length
  // // FEATURE = 1

  // let min = map[0][0][0]
  // let max = map[0][0][0]

  // for (let row = 0; row < ROW; row++) {
  //   for (let col = 0; col < COL; col++) {
  //     let value = 0
  //     for (let feature_index = 0; feature_index < FEATURE; feature_index++) {
  //       value += Math.abs(map[row][col][feature_index])
  //     }
  //     if (value < min) {
  //       min = value
  //     }
  //     if (value > max) {
  //       max = value
  //     }
  //   }
  // }

  // for (let row = 0; row < ROW; row++) {
  //   for (let col = 0; col < COL; col++) {
  //     let value = 0
  //     for (let feature_index = 0; feature_index < FEATURE; feature_index++) {
  //       value += Math.abs(map[row][col][feature_index])
  //     }
  //     value = (value - min) / (max - min)
  //     let color = heatmap_colors[Math.floor(value * 255)]
  //     heatmapContext.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`
  //     // heatmapContext.fillStyle = `rgba(255, 0, 0, ${value})`
  //     let left = (col / COL) * heatmapCanvas.width
  //     let top = (row / ROW) * heatmapCanvas.height
  //     let height = (1 / ROW) * heatmapCanvas.height
  //     let width = (1 / COL) * heatmapCanvas.width
  //     heatmapContext.fillRect(left, top, width, height)
  //   }
  // }

  const tape = tf.grad((x) => {
    let embedding = baseModel.model.predict(x) as tf.Tensor
    // console.log(embedding.shape)
    // return embedding

    //above unchanged
    //can check difference between tf.grad and tf.variablegrads
    let y = classifierModel.classifierModel.predict(embedding) as tf.Tensor
    return y

    // let weights = tf.randomNormal([1280, 4])
    // let result = embedding.matMul(weights)
    // console.log(result.shape)
    // return result

    // y.print()
    // return y
    // return y.slice(0, 1)
  })

  let zData = tf.tidy(() => {
    let x = tf.variable(tf.browser.fromPixels(image))
    x = tf.image.resizeBilinear(x, [224, 224])
    x = tf.div(x, 255)
    x = tf.expandDims(x, 0)

    // debugger

    let z = tape(x)

    // console.log('z range:', {
    //   min: z.min().arraySync(),
    //   max: z.max().arraySync(),
    // })

    let min = z.min()
    let max = z.max()
    let range = tf.sub(max, min)
    let normalized = tf.div(tf.sub(z, min), range)
    z = normalized

    // z.print()
    // debugger

    // Draw z (a tf.Tensor) to the canvas
    // Assume z is [1, 224, 224, 3] and values are in [0, 1] or [0, 255]
    let zData = z.squeeze().arraySync() as number[][][] // [224, 224, 3]
    return zData
  })

  let canvas = document.createElement('canvas')
  canvas.width = 224
  canvas.height = 224
  let context = canvas.getContext('2d')!

  let imageData = context.createImageData(224, 224)
  for (let y = 0; y < 224; y++) {
    for (let x = 0; x < 224; x++) {
      let idx = (y * 224 + x) * 4
      let pixel = zData[y][x]
      let r = pixel[0] * 255
      let g = pixel[1] * 255
      let b = pixel[2] * 255
      let value = (r + g + b) / 3
      let index = Math.floor(value )
      let color = heatmap_colors[index]
      if(!color){
        console.log(value,index)
      }
      imageData.data[idx + 0] = color[0]
      imageData.data[idx + 1] = color[1]
      imageData.data[idx + 2] = color[2]
      imageData.data[idx + 3] = 255
    }
  }
  context.putImageData(imageData, 0, 0)
  container.appendChild(canvas)

  return heatmapCanvas
}

Object.assign(window, {
  loadModels,
  tf,
  cropAndResizeImageTensor,
  toTensor3D,
  benchmark,
  render_cam_heatMap: heatMap,
})
