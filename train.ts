import { datasetCache, testDatasetCache, modelsCache } from './cache'
import { config } from './config'
import { saveClassifierModelMetadata } from './model'
import * as tf from '@tensorflow/tfjs-node'

export async function main() {
  let { classifierModel, metadata } = await modelsCache.get()
  let { x, y, classCounts } = await datasetCache.get()
  let { x:x_test, y:y_test, classCounts:classCounts_test } = await testDatasetCache.get()
  let epochs = 10
  let batchSize = 32
  let total_epochs = metadata.epochs + epochs
  let total_batches = Math.ceil(x.shape[0] / batchSize)

  async function evaluateOnTestSet() {
    const predictions = await Promise.all(
      tf.unstack(x_test).map(async (tensor) => {
        const results = await classifierModel.classifyImageEmbedding(tensor.expandDims(0));
        return results.map(result => result.confidence);
    }));
    const predTensor = tf.tensor2d(predictions, [predictions.length, classifierModel.classNames.length]);
    
    const loss = tf.metrics.categoricalCrossentropy(y_test, predTensor).mean();
    const accuracy = tf.metrics.categoricalAccuracy(y_test, predTensor).mean();

    return {
      loss: await loss.data(),
      accuracy: await accuracy.data(),
      dispose: () => predTensor.dispose()
    };
  }


  console.log(`\nTraining ${epochs} epochs...`)
  await classifierModel.train({
    x,
    y,
    classCounts,
    epochs,
    batchSize,
    verbose: 0,
    callbacks: [
      {
        onEpochBegin(epoch: number, logs: any) {
          metadata.epochs++
          process.stdout.write(
            `Epoch: ${metadata.epochs}/${total_epochs}, Batch: 1/${total_batches}`,
          )
        },
        onBatchEnd: (batch: number, logs: any) => {
          let accuracy = formatNumber(logs.categoricalAccuracy)
          let loss = formatNumber(logs.loss)
          process.stdout.write(
            `\rEpoch: ${metadata.epochs}/${total_epochs}, Batch: ${
              batch + 1
            }/${total_batches}, Accuracy: ${accuracy}, Loss: ${loss}`,
          )
        },
        onEpochEnd: async (epoch: number, logs: any) => {
          if (x_test && y_test) {
            let testResults = await evaluateOnTestSet();
            if (typeof classifierModel.evaluate === 'function'){
              testResults = await classifierModel.evaluate(x_test, y_test);
            }else{
              testResults = await evaluateOnTestSet();
            }
            const testAccuracy = formatNumber(testResults.accuracy[0]);
            const testLoss = formatNumber(testResults.loss[0]);
            testResults.dispose();
            process.stdout.write(
              `\n - Test Accuracy: ${testAccuracy}, Test Loss: ${testLoss}\n`,
            );
          } else {
            process.stdout.write(`\n`);
          }
        },
      },
    ],
  })
  await classifierModel.save()
  await saveClassifierModelMetadata(config.classifierModelDir, metadata)
}

function formatNumber(x: number) {
  if (x >= 1) {
    return x.toFixed(2)
  }
  if (x >= 0.1) {
    return x.toFixed(3)
  }
  if (x >= 0.01) {
    return x.toFixed(4)
  }
  return x.toExponential(2)
}

if (process.argv[1] == __filename) {
  main()
}
