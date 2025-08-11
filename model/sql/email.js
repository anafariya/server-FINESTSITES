const db = require('./knex')();

/*
* email.create()
* create the content for an email template
*/

exports.create = async function({ name, subject, preheader, body, button, locale }){

  return await db('email').insert({
    
    name: name,
    subject: subject,
    preheader: preheader,
    body: body,
    button_label: button.label,
    button_url: button.url,
    locale: locale

  });
}

/*
* email.get()
* get the content for an email by name
*/

exports.get = async function({ name, locale }){

  const data = await db('email').select('*').where({ 
    
    name: name, 
    locale: locale || 'en' 
  
  });

  return data.length ? data[0] : false;

}

/*
* email.update()
* update the content for an email template by name
*/

exports.update = async function({ name, data }){

  return await db('email').update(data).where({ name: name });

}

/*
* email.delete()
* delete an email template by name
*/

exports.delete = async function({ name }){

  return await db('email').del().where({ name: name });

}