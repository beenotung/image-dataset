import { datasetCache, modelsCache } from './cache'

export async function main() {
  let { classifierModel } = await modelsCache.get()
  let { x, y } = await datasetCache.get()
  await classifierModel.trainAsync({
    x,
    y,
    epochs: 20,
  })
  await classifierModel.save()
}

if (process.argv[1] == __filename) {
  main()
}
