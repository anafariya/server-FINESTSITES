exports.up = function(knex) {
  return knex.schema.createTable('email', table => {

    table.increments('id').primary();
    table.text('name');
    table.text('subject');
    table.text('preheader');
    table.text('body');
    table.string('button_label', 64);
    table.text('button_url');
    table.text('locale', 2).notNullable().defaultTo('en');

  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('email');
};
