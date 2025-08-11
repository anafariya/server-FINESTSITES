exports.up = function(knex) {
  return knex.schema.createTable('invite', table => {

    table.specificType('id', 'char(16) primary key');
    table.string('email', 512).notNullable();
    table.string('permission', 32).defaultTo('user');
    table.timestamp('date_sent').notNullable();
    table.bool('used').notNullable();
    table.string('account_id', 36).notNullable().references('id').inTable('account').onDelete('cascade');
    table.string('user_id', 36).references('id').inTable('user').onDelete('cascade');


  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('invite');
  
};
