import { existsSync } from 'fs'
import { join } from 'path'

export function resolveFile(filename: string) {
  let dir = __dirname
  for (;;) {
    let file = join(dir, filename)
    if (existsSync(file)) {
      return file
    }
  }
}
