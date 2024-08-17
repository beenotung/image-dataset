import { loadModels } from './model'

export async function main() {
  let { classifierModel } = await loadModels()
  await classifierModel.trainAsync({
    epochs: 10,
  })
  await classifierModel.save()
}

if (process.argv[1] == __filename) {
  main()
}
