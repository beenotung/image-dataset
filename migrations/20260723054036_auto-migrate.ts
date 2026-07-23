import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('image_keyword'))) {
    await knex.schema.createTable('image_keyword', table => {
      table.increments('id')
      table.integer('image_id').unsigned().notNullable().references('image.id')
      table.integer('keyword_id').unsigned().notNullable().references('keyword.id')
      table.unique(['image_id', 'keyword_id'])
      table.timestamps(false, true)
    })
  }

  await knex.raw(/* sql */ `
    insert into image_keyword (image_id, keyword_id)
    select image.id, image.keyword_id
    from image
    where image.keyword_id is not null
    and not exists (
      select 1 from image_keyword
      where image_keyword.image_id = image.id
      and image_keyword.keyword_id = image.keyword_id
    )
  `)
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('image_keyword')
}
