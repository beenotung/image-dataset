import { existsSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'

export function normalizeUrl(url: string) {
  if (
    url.startsWith('data:') ||
    url.startsWith('http://') ||
    url.startsWith('https://')
  ) {
    return url
  }

  let file = url.startsWith('file://') ? fileURLToPath(url) : url
  if (!existsSync(file)) {
    throw new Error('file not found: ' + url)
  }
  return pathToFileURL(file).href
}

export function urlToDomain(url_string: string) {
  let url = new URL(url_string)
  if (url.protocol == 'file:') {
    return 'local'
  }
  return url.hostname
}

export function urlToFolderName(url: string) {
  let { pathname, searchParams } = new URL(url)
  let parts = pathname.split('/').filter(s => s.length > 0)
  let name = parts[parts.length - 1] || ''
  let skip_names = ['search', 's', 'query', 'q', '']
  if (!skip_names.includes(name)) {
    return name
  }
  let keys = [
    'q',
    'k',
    'query',
    'search',
    's',
    'term',
    'terms',
    'keywords',
    'keyword',
    'wd',
    'oq',
  ]
  for (let key of keys) {
    let value = searchParams.get(key)
    if (value) {
      return value
    }
  }
  let fallback = url.replaceAll('%20', '+')
  let symbols = `:/\\?"'|`
  for (let symbol of symbols) {
    fallback = fallback.replaceAll(symbol, '-')
  }
  while (fallback.includes('--')) {
    fallback = fallback.replaceAll('--', '-')
  }
  return fallback
}
