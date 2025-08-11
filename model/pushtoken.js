const User = require('./user').schema;

/*
* pushtoken.create()
* assign a new push token to the user
*/

exports.create = async function({ user, token }){

  return await User.findOneAndUpdate({ id: user }, { $push: { push_token: token }});

}

/*
* pushtoken.get()
* get push tokens for the user
*/

exports.get = async function({ user, token }){

  const data = await User.findOne({ id: user }).select({ push_token: 1 });
  return data.push_token?.length ? data.push_token : null;

}

/*
* pushtoken.delete()
* remove a push token for this user
*/

exports.delete = async function({ user, token }){

  return await User.findOneAndDelete({ user: user },{ $pull: { push_token: token }});

};
