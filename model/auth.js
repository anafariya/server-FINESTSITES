const jwt = require('jsonwebtoken');
const config = require('config');
const key = require('./key');
const log = require('./log');
const utility = require('../helper/utility');
const permissions = config.get('permissions');
const settings = config.get('token');

/*
* auth.token()
* generate a JSON web token
*/

exports.token = function({ data, secret, duration }){

  return jwt.sign(data, secret || process.env.TOKEN_SECRET, { expiresIn: duration || settings.duration });

}

/*
* auth.token.verify()
* verify a JWT
*/

exports.token.verify = function({ token, secret }){

  return jwt.verify(token, secret || process.env.TOKEN_SECRET);

}

/*
* auth.verify()
* verify the user
*/

exports.verify = function(permission, scope, unverified){
  return async function(req, res, next){

    try {

      const header = req.headers['authorization'];

      // check header was provided
      if (!header){
        if (permission === 'public'){

          return next();

        }
        else {

          throw { message: res.__('auth.header_required') };

        }
      }   

      // process the header 
      const type = header.split(' ')[0];
      const token = header.split(' ')[1];

      // request is using api key
      if (type === 'Basic'){

        // use plaintext api key or decode base64
        const apikey = token.includes('key-') ? token : utility.base64.decode(token).replace(':', '');

        const verified = await key.verify(apikey);
        utility.assert(verified, res.__('auth.invalid_api_key'));

        // key ok, check scope
        utility.assert(verified.scope.includes(scope), res.__('auth.invalid_scope'));
       
        // log request and continue
        if (process.env.ENABLE_API_LOGS === 'true')
          log.create({ body: req.body, req: req, sendNotification: false, account: verified.account_id });

        req.account = verified.account_id;
        next();

      }
      else if (type === 'Bearer'){

        const decode = jwt.verify(token, process.env.TOKEN_SECRET);
      
        // check account is verified
        if (decode.unverified && !unverified && permission !== 'public')
          return res.status(500).send({ message: res.__('auth.unverified_account') });

        if (decode.accountId && decode.userId && decode.permission && decode.provider){
          if (permission === 'public' || permissions[decode.permission][permission]){

            req.account = decode.accountId;
            req.user = decode.userId;
            req.permission = decode.permission;
            req.provider = decode.provider;
            next();

          } else throw new Error(); // user doesn't have permission
        }
        else throw { message: res.__('auth.invalid_token') }; // invalid auth token
      }
      else throw { message: res.__('auth.invalid_header_type') }; // unknown header type
    }
    catch (err){
      
      res.status(401).send({

        message: err.message || res.__('auth.invalid_permission')

      });
    }
  }
}