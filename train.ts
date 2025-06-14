import { datasetCache, modelsCache } from './cache'
import { config } from './config'
import { saveClassifierModelMetadata } from './model'

export async function main() {
  let { classifierModel, metadata } = await modelsCache.get()
  let { x, y, classCounts } = await datasetCache.get()
  let epochs = 10
  let batchSize = 32
  let total_epochs = metadata.epochs + epochs
  let total_batches = Math.ceil(x.shape[0] / batchSize)
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
        onEpochEnd: (epoch: number, logs: any) => {
          process.stdout.write(`\n`)
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
