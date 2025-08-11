const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// define schema
const EmailSchema = new Schema({

  name: { type: String, required: true },
  subject: { type: String, required: true },
  preheader: { type: String, required: false },
  body: { type: String, required: false },
  button_label: { type: String, required: false },
  button_url: { type: String, required: false },
  locale: { type: String, required: true }

});

const Email = mongoose.model('Email', EmailSchema, 'email');
exports.schema = Email;

/*
* email.create()
* create the content for an email template
*/

exports.create = async function({ id, name, subject, preheader, body, button, locale }){

  const data = Email({

    id: id,
    name: name,
    subject: subject,
    preheader: preheader,
    body: body,
    button_label: button.label,
    button_url: button.url,
    locale: locale || 'en',

  });

  const newEmail = Email(data);
  await newEmail.save();
  return data;

}

/*
* email.get()
* get the content for an email by name
*/

exports.get = async function({ name, locale }){

  return await Email.findOne({ name: name, locale: locale || 'en' }).lean();

}

/*
* email.update()
* update the content for an email template by name
*/

exports.update = async function({ name, data }){

  return await Email.findOneAndUpdate({ name: name }, data);
  
}

/*
* email.delete()
* delete an email template by name
*/

exports.delete = async function({ name }){

  return await Email.findOneAndDelete({ name: name });

}