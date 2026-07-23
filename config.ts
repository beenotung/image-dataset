export type SearchEngine = 'google' | 'bing'

export let config = {
  downloadedRootDir: './downloaded',
  datasetRootDir: './dataset',
  classifiedRootDir: './classified',
  unclassifiedRootDir: './unclassified',
  baseModelDir: './saved_models/base_model',
  classifierModelDir: './saved_models/classifier_model',
  chromiumDir: './.chromium',
  searchEngine: 'google' as SearchEngine,
}
