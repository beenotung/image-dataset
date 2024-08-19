import { rmSync } from 'fs'
import { main as train } from './train'

export async function main() {
  rmSync('saved_models/classifier_model', { recursive: true })
  await train()
}

if (process.argv[1] == __filename) {
  main()
}
