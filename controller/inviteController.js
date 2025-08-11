const config = require('config');
const domain = config.get('domain');
const joi = require('joi');
const account = require('../model/account');
const mail = require('../helper/mail');
const invite = require('../model/invite');
const utility = require('../helper/utility');
const i18nHelper = require('../helper/i18n');

/*
* invite.create()
* invite a new user to join an account
*/

exports.create = async function(req, res){

  // validate
  const data = utility.validate(joi.object({

    email: joi.string().required(),
    permission: joi.string().required(),
    url: joi.string()

  }), req, res); 

  let invites = [];
  const permission = data.permission;

  const accountData = await account.get({ id: req.account });
  utility.assert(accountData, res.__('account.invalid'));
  utility.assert(accountData.plan, res.__('account.plan_required'));

  // can only invite admin or user on new invites
  if (data.hasOwnProperty('permission'))
    utility.assert((permission === 'admin' || permission === 'user'), res.__('invite.invalid_permission'));

  // split emails
  const emails = data.email.replace(' ', '').split(',');
  let msg = i18nHelper.plural('invite.sent', emails.length);

  // check length
  if (emails.length > 10)
    return res.status(500).send({ message: res.__('invite.max_emails', { max: 10 }) });

  // invite each user
  for (const email of emails){

    // has user been invited?
    let inviteData = await invite.get({ email: email, account: req.account });

    if (inviteData){

      // block/ignore duplicate accepted invites
      if (inviteData.used){ 
        
        // block with error for a single duplicate
        if (emails.length === 1)
          throw { message: res.__('invite.already_accepted', { email: email }) }
        
        // message for multiple so valid invites are not blocked
        msg += res.__('invite.duplicates_ignored')

      }
      else await invite.update({ id: inviteData.id, data: { date_sent: new Date() }})
      
    }
    else 
      inviteData = await invite.create({ email: email, permission: permission, account: req.account });

    if (!inviteData.used)
      invites.push(inviteData);
              
    await mail.send({

      to: email,
      locale: req.locale,
      template: 'invite',
      content: {

        friend: accountData.owner_name,
        id: inviteData.id,
        email: inviteData.email,
        domain: utility.validateNativeURL(data.url) || `${domain}/signup/user`

      }
    });
  }

  return res.status(200).send({ message: msg, data: invites });

};

/*
* invite.get()
* return a list of, or a single invite
*/

exports.get = async function(req, res){

  const data = await invite.get({ id: req.params.id, account: req.account, returnArray: true, used: false });
  return res.status(200).send({ data: data });

}

/*
* invite.delete()
* delete a user invite
*/

exports.delete = async function(req, res){

  utility.assert(req.params.id, res.__('invite.delete.id_required'));
  
  await invite.delete({ id: req.params.id, account: req.account });
  return res.status(200).send({ message: res.__('invite.delete.success'), data: req.params.id });

}
