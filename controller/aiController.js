const joi = require('joi');
const openai = require('../model/openai');
const account = require('../model/account');
const utility = require('../helper/utility');

exports.text = async function(req, res){

  // validate
  const data = utility.validate(joi.object({
    
    prompt: joi.string().required(),

  }), req, res); 

  // check account has a plan
  const accountData = await account.get({ id: req.account });
  utility.assert(accountData.plan, res.__('account.plan_required'));

  console.log(res.__('ai.start'));
  const chatData = await openai.text({ prompt: data.prompt });

  console.log(i18n.__('ai.finish'));
  return res.status(200).send({ data: chatData });

}

exports.image = async function(req, res){

  // validate
  const data = utility.validate(joi.object({
  
    prompt: joi.string().required(),
    size: joi.string().required(),

  }), req, res); 

  // check account has a plan
  const accountData = await account.get({ id: req.account });
  utility.assert(accountData.plan, res.__('account.plan_required'));

  console.log(res.__('ai.start'));
  const imageData = await openai.image({ prompt: data.prompt, size: data.size });  

  console.log(i18n.__('ai.finish'));
  return res.status(200).send({ data: imageData })

}