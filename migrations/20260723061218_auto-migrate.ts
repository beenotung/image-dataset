import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.raw('alter table `image` add column `src` text null')

  if (!(await knex.schema.hasTable('image_url'))) {
    await knex.schema.createTable('image_url', table => {
      table.increments('id')
      table.integer('image_id').unsigned().notNullable().references('image.id')
      table.text('url').notNullable()
      table.unique(['image_id', 'url'])
      table.timestamps(false, true)
    })
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('image_url')
  await knex.raw('alter table `image` drop column `src`')
}
