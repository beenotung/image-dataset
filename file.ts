import { existsSync } from 'fs'
import { join, resolve } from 'path'

export function resolveFile(filename: string) {
  let dir = __dirname
  for (;;) {
    let file = join(dir, filename)
    if (existsSync(file)) {
      return file
    }
    dir = join(dir, '..')
    if (resolve(dir) == '/') {
      throw new Error('file not found: ' + JSON.stringify(filename))
    }
  }
}
