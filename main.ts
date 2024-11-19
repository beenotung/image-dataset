async function main() {
  await require('./cli').cli()
}

main().catch(e => console.error(e))
