const mongoose = require('mongoose');
const config = require('config');
const Cryptr = require('cryptr');
const crypto = new Cryptr(process.env.CRYPTO_SECRET);
const { v4: uuidv4 } = require('uuid');
const utility = require('../helper/utility');
const Schema = mongoose.Schema;

// define schema
const TokenSchema = new Schema({

  id: { type: String, required: true, unique: true },
  provider: { type: String, required: true },
  jwt: { type: String },
  access: { type: String },
  refresh: { type: String },
  issued_at: { type: Date, required: true },
  expires_at: { type: Date, required: true },
  active: { type: Boolean, required: true, default: true },
  user_id: { type: String, required: true }

});

const Token = mongoose.model('Token', TokenSchema, 'token');

/*
* token.save()
* create new or update an existing token
*/

exports.create = async function({ id, provider, data, user }){

  if (data.access)
    data.access = crypto.encrypt(data.access)

  if (data.refresh)
    data.refresh = crypto.encrypt(data.refresh);


  // create a new token
  const tokenData = {

    id: id || uuidv4(),
    provider,
    jwt: data.jwt,
    access: data.access,
    refresh: data.refresh,
    active: true,
    issued_at: utility.timestamp.utc(),
    expires_at: utility.timestamp.utc(new Date(Date.now() + config.get('token.duration') * 1000)),
    user_id: user

  };

  const newToken = await Token.create(tokenData);
  return newToken;
  
}

/*
* token.get()
* return the token for the new user
*/

exports.get = async function({ id, provider, user, active = true }){
  
  const data = await Token.find({

    ...id && { id },
    ...provider && { provider },
    ...active !== undefined && { active },
    user_id: user

  });

  return data;

}

/* 
* token.update()
* update token(s)
*/

exports.update = async function({ id, data }){

  if (!Array.isArray(id))
    id = [id];

  return await Token.updateMany({ id: { $in: Array.isArray(id) ? id : [id] } }, data);

}

/*
* token.verify()
* check if a token is present for provider/user
*/

exports.verify = async function({ id, provider, user }){

  const data = await Token.find({ id,user_id: user, provider: provider });
  return data.length ? true : false;
  
}

/*
* token.delete()
* delete an token
*/

exports.delete = async function({ id, provider, user }){

  return await Token.deleteOne({ 
    
    user_id: user,
    ...provider && { provider: provider },
    ...id && { id: id }
  
  });
}
