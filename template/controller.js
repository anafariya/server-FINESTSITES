const joi = require('joi');
const {{view}} = require('../model/{{view}}');
const utility = require('../helper/utility.js');

exports.create = async function(req, res){

  // const data = utility.validate(joi.object({
  
  //   name: joi.string().required(),

  // }), req, res);

  const {{view}}Data = await {{view}}.create({ data: data, account: req.account });
  res.status(200).send({ message: res.__('{{view}}.create.success'), data: {{view}}Data });

}

exports.get = async function(req, res){

  const data = await {{view}}.get({ id: req.params.id, account: req.account });
  res.status(200).send({ data: data });

}

exports.update = async function(req, res){

  utility.assert(req.params.id, res.__('{{view}}.update.id_required'));

  // const data = utility.validate(joi.object({
  
  //   name: joi.string().required(),

  // }), req, res);

  const {{view}}Data = await {{view}}.update({ id: req.params.id, data: data, account: req.account });
  res.status(200).send({ message: res.__('{{view}}.update.success'), data: {{view}}Data });

}

exports.delete = async function(req, res){

  utility.assert(req.params.id, res.__('{{view}}.delete.id_required'));

  await {{view}}.delete({ id: req.params.id, account: req.account });
  res.status(200).send({ message: res.__('{{view}}.delete.success') });

}
