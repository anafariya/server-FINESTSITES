const joi = require('joi');
const mail = require('../helper/mail');
const s3 = require('../helper/s3');
const utility = require('../helper/utility');

exports.upload = async function(req, res){

  // files stored in req.files
  // automatically saved to /uploads folder
  // all other fields stored in req.body
  // upload the file to s3 bucket
  if (req.files.length){
    for (file of req.files){

      await s3.upload({ bucket: process.env.S3_BUCKET, file: file });

    }
  }

  res.status(200).send({ message: res.__('utility.uploaded') });

}

/* 
*  public mail endpoint 
*  can only email you to prevent spam
*/

exports.mail = async function(req, res){
  
  // validate
  const data = utility.validate(joi.object({
  
    name: joi.string().required(),
    email: joi.string().email().required(),
    message: joi.string().required(),
    template: joi.string()

  }), req, res);

  await mail.send({

    to: process.env.SUPPORT_EMAIL,
    locale: req.locale,
    template: data.template || 'contact',
    content: {
  
      name: data.name,
      email: data.email,
      message: data.message
  
    }
  });

  res.status(200).send({ message: res.__('utility.message_sent') });

}