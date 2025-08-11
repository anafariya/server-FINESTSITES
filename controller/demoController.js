// const demo = require('../model/demo');
const account = require('../model/account');
const utility = require('../helper/utility');

/*
* returns sample data for the demo dashboard
* you can delete this file
*/

exports.get = async function(req, res){

  // check account has a plan
  const accountData = await account.get({ id: req.account });
  // utility.assert(accountData.plan, res.__('account.plan_required'));
  const demo = null
  const revenue = demo?.revenue({ locale: req.locale });
  const users = demo?.users({ locale: req.locale });
  const stats = demo?.stats({ locale: req.locale });

  return res.status(200).send({ data: { revenue, users, stats }});

}
