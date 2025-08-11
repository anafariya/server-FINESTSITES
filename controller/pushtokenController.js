const joi = require('joi');
const pushtoken = require('../model/pushtoken');
const utility = require('../helper/utility');

/*
* push_token.create()
* create/update a new push token
*/

exports.create = async function(req, res){
  
  // validate
  const data = utility.validate(joi.object({

    push_token: joi.string().required(),

  }), req, res); 

  // does this token already belong to this user?
  const token = await pushtoken.get({ user: req.user, token: data.push_token });

  if (!token?.length)
    await pushtoken.create({ user: req.user, token: data.push_token });

  return res.status(200).send({ message: res.__('push_token.saved') });

}
