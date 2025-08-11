const account = require('../model/account');
const utility = require('../helper/utility');
const mongoose = require('mongoose');
const s3 = require('../helper/s3');
const path = require('path');
const user = require('../model/user');
const transaction = require('../model/transaction');
const mail = require('../helper/mail');

/*
 * transaction.getById()
 */
exports.getById = async function (req, res) {
  const id = req.params.id;
  const idUser = req.user
  utility.assert(id , 'No Id provided');
  const userData = await user.get({ id: idUser });
  try {
    const data = await transaction.getById({ id: new mongoose.Types.ObjectId(id), user_id:  new mongoose.Types.ObjectId(userData._id) });

    return res.status(200).send({ data: data });
  } catch (err) {
    return res.status(400).send({ error: err.message });
  }
};

/*
* transaction.successPayment()
* attach sepa payment to customer
*/

exports.successPayment = async function(req, res){

  // utility.validate(req.body);
  utility.assert(req.body.transaction, res.__('account.invalid'));
  const accountData = await account.get({ id: req.account });
  utility.assert(accountData, res.__('account.invalid'));
  
  if(!accountData.stripe_customer_id){
    utility.assert(accountData.stripe_customer_id, res.__('account.sepa.missing'));
  }

  const transactionUser = await transaction.findOneAndUpdate({id: new mongoose.Types.ObjectId(req.body.transaction)}, {
    status: 'paid'
  })

  if(transactionUser){
    const curUser = await user.get({id: req.user, account: req.account})
    
    await account.update({id: req.account, data: {
      virtual_currency: transactionUser.quantity
    }})
    // send email 
    await mail.send({
     
      to: curUser.email,
      locale: req.locale,
      custom: true,
      template: 'template',
      subject: `${res.__('payment.buy_hearts.subject')}`,
      content: { 
  
        name: `${curUser.first_name}`, 
        body: res.__('payment.buy_hearts.body', {
          amount: `€ ${transactionUser.amount}`,
          quantity: transactionUser.quantity,
          date: utility.formatDateString(new Date()),
        }),
        button_url: process.env.CLIENT_URL,
        button_label: res.__('payment.buy_hearts.button')
      
      }
    });
  }


  return res.status(200).send({ 
    
    data: {
      quantity: transactionUser.quantity
    },
    message: res.__('account.sepa.updated')
  });
};