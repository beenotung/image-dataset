import { loadModels } from './model'

export function makeCache<T>(
  fn: () => Promise<T>,
  clearFn?: (lastValue: T) => void | Promise<void>,
) {
  let value: T | null = null
  async function load() {
    if (value != null && clearFn) {
      await clearFn(value)
    }
    value = await fn()
  }
  async function get() {
    value ||= await fn()
    return value
  }
  return { load, get }
}

export let modelsCache = makeCache(() => loadModels())

export let datasetCache = makeCache(async () => {
  let models = await modelsCache.get()
  return models.classifierModel.loadDatasetFromDirectory()
})

export let testDatasetCache = makeCache(async () => {
  let models = await modelsCache.get()
  // TODO change to load fomr test data after tensorflow-helpers update
  // return models.classifierModel.loadTestDatasetFromDirectory()
    return models.classifierModel.loadDatasetFromDirectory()
})
