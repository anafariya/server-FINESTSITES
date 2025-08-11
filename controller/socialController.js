const config = require('config');
const domain = config.get('domain');
const passport = require('passport');
const account = require('../model/account');
const invite = require('../model/invite');
const token = require('../model/token');
const user = require('../model/user');
const facebook = config.get('facebook');
const twitter = config.get('twitter');
const mail = require('../helper/mail');
const notification = require('../model/notification');
const facebookstrategy = require('passport-facebook');
const twitterstrategy = require('@passport-js/passport-twitter');

// config passport
const FacebookStrategy = facebookstrategy.Strategy;
const TwitterStrategy = twitterstrategy.Strategy;

passport.serializeUser((user, done) => { done(null, user) });
passport.deserializeUser((obj, done) => { done(null, obj) });

if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET){
  passport.use(
    new FacebookStrategy({

      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: facebook.callback_url,
      profileFields: ['id', 'name', 'email', 'picture.type(small)'],
      enableProof: true,
      passReqToCallback: true

    },
    async function(req, accessToken, refreshToken, profile, done) {
      
      await handleCallback(req, profile, { access: accessToken, refresh: refreshToken }, done);

    })
  );
}

if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET){
  passport.use(
    new TwitterStrategy({

      consumerKey: process.env.TWITTER_API_KEY,
      consumerSecret: process.env.TWITTER_API_SECRET,
      callbackURL: twitter.callback_url,
      userProfileURL  : 'https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true',
      passReqToCallback: true,

    },
    async function(req, accessToken, refreshToken, profile, done) {

      await handleCallback(req, profile, { access: accessToken, refresh: refreshToken }, done);

    })
  );
}

async function handleCallback(req, profile, tokens, done){

  // create a new user and/or account or sign existing user in
  // there's no global error handling available here as we're
  // using server-side routing, not an API call
  // pass errors to done() and then pass them to the client
  // in authController.social via query string
  if (!profile) 
    return done({ message: res.__('social.profile_error') });

  const provider = profile.provider;
  const email = profile.emails[0]?.value;
  const data = {

    name: profile?.name?.givenName || profile.username,
    email: email,
    avatar: profile.photos?.[0]?.value,
    ...provider === 'facebook' && { facebook_id: profile.id },
    ...provider === 'twitter' && { twitter_id: profile.id },

  }
  
  // get the user
  let userData = await user.get({ email: email, social: { provider: provider, id: profile.id }});

  // user came from signup page and already has an account
  // if they don't have an owner account then create a new one
  // otherwise this user is a child user
  if (req.session.signup && !req.session.invite && userData){

    userData.accounts = await user.account({ id: userData.id });

    // does the user have a parent account?
    if (!userData.accounts.find(x => x.permission === 'owner')){

      const accountData = await account.create();
      await user.account.add({ id: userData.id, account: accountData.id, permission: 'owner' });
      await user.update({ id: userData.id, account: accountData.id, data: { default_account: accountData.id }});

    }
  }

  // this is an invite to a child account
  if (req.session.invite){

    const inviteData = await invite.get({ id: req.session.invite, used: false });
    if (!inviteData) return done({ message: res.__('social.invalid_invite') });
   
    // update user existing user
    if (userData){

      const social = { default_account: inviteData.account_id };
      social[`${provider}_id`] = profile.id;
      await user.update({ id: userData.id, account: userData.account_id, data: social })

    }
    else {

      // create a new user
      userData = await user.create({ user: data, account: inviteData.account_id });

    }

    // assign the user to the parent account and close the invite
    await user.account.add({ id: userData.id, account: inviteData.account_id, permission: inviteData.permission });
    await invite.update({ id: req.session.invite, data: { used: true, user_id: userData.id }}); 

  }
  else if (userData){

    // user exists, authenticate them and add additional social if necessary
    if (!userData[`${provider}_id`]){

      const social = {};
      social[`${provider}_id`] = profile.id;
      await user.update({ id: userData.id, account: userData.account_id, data: social })

    }  

    // done, pass execution to authController
    await token.create({ provider: provider, data: tokens, user: userData.id });
    return done(null, profile);

  }
  else {

    // user doesn't exist and wasn't invited - create user & account
    const accountData = await account.create();
    userData = await user.create({ user: data, account: accountData.id });
    await user.account.add({ id: userData.id, account: accountData.id, permission: 'owner' });
    notification.create({ user: userData.id, account: accountData.id, permission: 'owner' });

    // send email
    await mail.send({

      to: userData.email,
      locale: req.locale,
      template: 'new_user',    
      content: { 
        
        name: userData.name, 
        domain: domain,
      
      }
    });
  }

  // done - save token and pass to authController
  await token.create({ provider: provider, data: tokens, user: userData.id });
  done(null, profile);

}