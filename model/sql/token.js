const db = require('./knex')();
const config = require('config');
const Cryptr = require('cryptr');
const crypto = new Cryptr(process.env.CRYPTO_SECRET);
const utility = require('../helper/utility');
const { v4: uuidv4 } = require('uuid');

/*
* token.save()
* create a new token
*/

exports.create = async function({ id, provider, data, user }){

  // encrypt tokens before saving
  if (data.access)
    data.access = crypto.encrypt(data.access)

  if (data.refresh)
    data.refresh = crypto.encrypt(data.refresh);

  data.id = id || uuidv4(), // set a default id if no jit was passed
  data.provider = provider;
  data.user_id = user;
  data.active = true;
  data.issued_at = utility.timestamp.utc();
  data.expires_at = utility.timestamp.utc(new Date(Date.now() + config.get('token.duration') * 1000));
  await db('token').insert(data);

  return data;
  
}

/*
* token.get()
* get an access token for a user by id or provider
*/

exports.get = async function({ id, provider, user, active = true }){

  return await db('token').select('*')
  .where({

    ...id && { id },
    ...provider && { provider },
    ...active !== undefined && { active },
    user_id: user

  });
}

/* 
* token.update()
* update token(s)
*/

exports.update = async function({ id, data }){

  if (!Array.isArray(id))
    id = [id];

  return await db('token').update(data).whereIn('id', id);

}

/*
* token.verify()
* check if an active token is present for provider/user
*/

exports.verify = async function({ id, provider, user }){

  const data = await db('token').select('id')
  .where({ id, provider, user_id: user, active: true });

  return data.length ? true : false;
  
}

/*
* token.delete()
* delete a token
*/

exports.delete = async function ({ id, provider, user }){

  return await db('token').del()
  .where({ user_id: user })
  .modify(q => {

    id && q.where('id', id);
    provider && q.where('provider', provider);

  });
}