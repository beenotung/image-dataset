import { setupDB } from './setup'

async function main() {
  await setupDB()
  await require('./cli').cli()
}

main().catch(e => console.error(e))
