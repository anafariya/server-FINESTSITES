const event = require('../model/event-management');
const utility = require('../helper/utility');
const mongoose = require('mongoose');
const s3 = require('../helper/s3');
const path = require('path');
const user = require('../model/user');
const transaction = require('../model/transaction');

/*
 * virtualCurrency.checkout()
 */
exports.checkout = async function (req, res) {
  try {
    const id = req.user
    const { amount } = req.body
    utility.assert(amount , 'Please select the amount');
    const userData = await user.get({ id: id });
    utility.assert(userData, res.__('user.invalid'));
    if(userData){
      const payment = await transaction.create({
        user_id: userData._id,
        type: 'Buy Hearts',
        amount: (amount / 100) * 7,
        quantity: amount,
        status: 'unpaid'
      })
      
      return res.status(200).send({ data: {
        id: payment._id
      } });
    }
  } catch (err) {
    return res.status(500).send({ error: err.message });
  }
};

/*
 * virtualCurrency.getById()
 */
exports.getById = async function (req, res) {
  const id = req.params.id;

  try {
    utility.validate(id);
    const eventData = await event.getById({ id: new mongoose.Types.ObjectId(id) });
    if(eventData){
      const ext = await path.extname(eventData.image).slice(1);
      const previewSignedUrl = await s3.signedURLView({
        filename: `${eventData.image}`,
        acl: 'bucket-owner-full-control',
        // 'public-read',
        contentType: `image/${ext}`,
      });
      eventData.image = previewSignedUrl;
    }
    return res.status(200).send({ data: eventData });
  } catch (err) {
    return res.status(400).send({ error: err.message });
  }
};