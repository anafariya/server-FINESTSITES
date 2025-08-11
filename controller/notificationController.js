const notification = require('../model/notification');

exports.get = async function(req, res){

  const data = await notification.get({ 
    
    user: req.user, 
    account: req.account,
    permission: req.permission 
  
  });

  return res.status(200).send({ data: data });

}

exports.update = async function (req, res){
  
  await notification.update({ user: req.user, account: req.account, data: req.body });
  return res.status(200).send({ message: 'Notification settings saved' });

}