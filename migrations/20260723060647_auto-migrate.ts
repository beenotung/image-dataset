import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('image_page'))) {
    await knex.schema.createTable('image_page', table => {
      table.increments('id')
      table.integer('image_id').unsigned().notNullable().references('image.id')
      table.integer('page_id').unsigned().notNullable().references('page.id')
      table.unique(['image_id', 'page_id'])
      table.timestamps(false, true)
    })
  }

  await knex.raw(/* sql */ `
    insert into image_page (image_id, page_id)
    select image.id, image.page_id
    from image
    where image.page_id is not null
    and not exists (
      select 1 from image_page
      where image_page.image_id = image.id
      and image_page.page_id = image.page_id
    )
  `)
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('image_page')
}
