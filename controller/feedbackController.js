const joi = require('joi');
const feedback = require('../model/feedback');
const mail = require('../helper/mail');
const utility = require('../helper/utility');

exports.create = async function(req, res){

  // validate
  const data = utility.validate(joi.object({
  
    rating: joi.string().required(),
    comment: joi.string().required(),

  }), req, res); 

  const feedbackData = await feedback.create({ data, user: req.user });

  await mail.send({

    to: process.env.SUPPORT_EMAIL,
    locale: req.locale,
    template: 'feedback',
    content: {
  
      rating: data.rating,
      comment: data.comment,
      domain: process.env.MISSION_CONTROL_CLIENT
  
    }
  });

  res.status(200).send({ message: res.__('feedback.create.success'), data: feedbackData });

}

exports.get = async function(req, res){

  const data = await feedback.get();
  res.status(200).send({ data: data });

}

exports.metrics = async function(req, res){

  const data = await feedback.metrics();
  res.status(200).send({ data: data });

}

exports.delete = async function(req, res){

  utility.assert(req.params.id, res.__('feedback.delete.id_required'));

  await feedback.delete(req.params.id);
  res.status(200).send({ message: res.__('feedback.delete.success') });

}
