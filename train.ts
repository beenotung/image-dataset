import { datasetCache, modelsCache } from './cache'
import { config } from './config'
import { saveClassifierModelMetadata } from './model'

export async function main() {
  let { classifierModel, metadata } = await modelsCache.get()
  let { x, y, classCounts } = await datasetCache.get()
  await classifierModel.train({
    x,
    y,
    classCounts,
    epochs: 10,
    callbacks: [
      {
        onEpochEnd: (_epoch: number, logs: any) => {
          metadata.epochs++
        },
      },
    ],
  })
  await classifierModel.save()
  await saveClassifierModelMetadata(config.classifierModelDir, metadata)
}

if (process.argv[1] == __filename) {
  main()
}
