import { datasetCache, modelsCache } from './cache'

export async function main() {
  let { classifierModel } = await modelsCache.get()
  let { x, y, classCounts } = await datasetCache.get()
  await classifierModel.train({
    x,
    y,
    classCounts,
    epochs: 10,
  })
  await classifierModel.save()
}

if (process.argv[1] == __filename) {
  main()
}
