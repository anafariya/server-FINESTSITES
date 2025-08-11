const config = require('config');
const joi = require('joi');
const key = require('../model/key');
const account = require('../model/account');
const crypto = require('crypto');
const utility = require('../helper/utility');

exports.create = async function(req, res){

  // validate
  const data = utility.validate(joi.object({

    name: joi.string().required(),
    scope: joi.array().required()

  }), req, res); 

  // check account has a plan
  const accountData = await account.get({ id: req.account });
  utility.assert(accountData.plan, res.__('account.plan_required'));

  // generate a unique key
  do data.key = 'key-' + crypto.randomBytes(32).toString('hex');
  while (!(await key.unique(data.key)));

  // save the key
  const keyData = await key.create({ data: data, account: req.account });
  res.status(200).send({ message: res.__('api_key.create.success'), data: keyData });
  
}

exports.get = async function(req, res){

  const data = await key.get({ id: req.params.id, account: req.account });
  res.status(200).send({ data: data });

}

exports.scopes = async function(req, res){

  res.status(200).send({ data: config.get('api_scopes') });

}

exports.update = async function(req, res){

  utility.assert(req.params.id, res.__('api_key.update.id_required'));

  const data = utility.validate(joi.object({

    name: joi.string(),
    scope: joi.array(),
    active: joi.alternatives().try(joi.boolean(), joi.number().valid(0, 1)), 

  }), req, res); 

  await key.update({ id: req.params.id, data: {
    
    ...data.name && { name: data.name },
    ...data.scope && { scope: data.scope },
    ...data.active && { active: data.active }

  }, account: req.account });

  res.status(200).send({ message: res.__('api_key.update.success') });

}

exports.delete = async function(req, res){

  const data = utility.validate(

    joi.object({
      id: joi.alternatives().try(
        joi.array().items(joi.string()),
        joi.string()
      ).required()
    }), req, res
  );
  
  await key.delete({ id: data.id, account: req.account });
  res.status(200).send({ message: res.__('api_key.delete.success') });

}