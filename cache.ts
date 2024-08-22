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
