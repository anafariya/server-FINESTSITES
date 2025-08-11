const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Cryptr = require('cryptr');
const escape = require('lodash.escape');
const crypto = new Cryptr(process.env.CRYPTO_SECRET);
const Schema = mongoose.Schema;
const ConfirmedMatch = require('./confirm-match').schema;

// define schema
const UserSchema = new Schema({

  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String },
  date_created: Date,
  last_active: Date,
  disabled: { type: Boolean },
  support_enabled: { type: Boolean, required: true },
  '2fa_enabled': { type: Boolean, required: true },
  '2fa_secret': { type: String, required: false },
  '2fa_backup_code': { type: String, required: false },
  default_account: { type: String },
  facebook_id: { type: String },
  twitter_id: { type: String },
  account: { type: Array },
  push_token: { type: String },
  avatar: { type: String },
  dark_mode: { type: Boolean },
  verified: { type: Boolean, required: true },
  step: { type: Number, default: 1 },
  onboarded: { type: Boolean, default: false },
  first_name: { type: String },
  last_name: { type: String },
  gender: { type: String, enum: ['male', 'female', 'diverse'], default: null },
  date_of_birth: { type: Date },
  interests: [{ type: String }],
  looking_for: { type: String },
  profession: { type: String },
  smoking_status: { type: Boolean, default: null },
  description: { type: String },
  images: [{ type: String }],
  is_invited: { type: Boolean, default: null },
  locale: { type: String, default: 'de' },
  relationship_goal: { type: String, default: null },
  children: { type: Boolean, default: null },
  kind_of_person: { type: String, default: null },
  feel_around_new_people: { type: String, default: null },
  prefer_spending_time: { type: String, default: null },
  describe_you_better: { type: String, default: null },
  describe_role_in_relationship: { type: String, default: null },
});

const User = mongoose.model('User', UserSchema, 'user');
exports.schema = User;

/*
* user.create()
* create a new user
*/

exports.create = async function({ user, account }){
  
  const data = {

    id: uuidv4(),
    name: escape(user.name),
    email: user.email,
    date_created: new Date(),
    last_active: new Date(),
    support_enabled: false,
    '2fa_enabled': false,
    facebook_id: user.facebook_id,
    twitter_id: user.twitter_id,
    ...user.account && { account: user.account },
    ...user.onboarded && { onboarded: user.onboarded },
    ...user.step && { step: user.step },
    ...user.first_name && { account: user.first_name },
    ...user.last_name && { account: user.last_name },
    default_account: account,
    avatar: user.avatar,
    verified: user.verified,
    is_invited: user.is_invited,
    gender: user.gender,
    date_of_birth: user.date_of_birth,
    looking_for: user.looking_for,
    relationship_goal: user.relationship_goal,
    children: user.children,
    kind_of_person: user.kind_of_person,
    feel_around_new_people: user.feel_around_new_people,
    prefer_spending_time: user.prefer_spending_time,
    describe_you_better: user.describe_you_better,
    describe_role_in_relationship: user.describe_role_in_relationship

  }
  
  // encrypt password
  if (user.password){

    const salt = await bcrypt.genSalt(10);
    data.password = await bcrypt.hash(user.password, salt);

  }

  const newUser = User(data);
  await newUser.save();

  if (data.password){

    delete data.password;
    data.has_password = true;

  }
  
  data.account_id = account;
  return {...newUser?.toObject(), ...data};

}

/*
* user.get()
* get a user by email or user id
*/

exports.get = async function({ id, email, account, social, permission }){

  let data;
  const cond = {

    ...account && { 'account.id': account },
    ...permission && { 'account.permission': permission },
    
  };

  if (social){
  
    cond[`${social.provider}_id`] = social.id;
    data = await User.find({ $or: [{ email: email }, cond]}).lean();

  }
  else {

    data = await User.find({...cond, ...{

      ...id && { id: id },
      ...email && { email: email },

    }}).lean();

  }

  if (data?.length){  
    data.forEach(u => {
      
      // get id, perm and onboarded for this account
      u.account_id = account || u.default_account;
      const a = u.account?.find(x => x.id === u.account_id);
      if(a?.permission){
        u.permission = a.permission;
      }
      u.onboarded = a?.onboarded || false;
      u.has_password = u.password ? true : false;
      delete u.password;
      delete u.account;

    })
  }

  return (id || email || social) ? data[0] : data;

}

/*
* user.getProfileOtherUser()
* get a user by user id
*/

exports.getProfileOtherUser = async function({ _id }){

if (!_id) return null;

  const user = await User.findOne({ _id })
    .select('first_name date_of_birth avatar last_name gender interests looking_for images description smoking_status profession')
    .lean();

  if (!user) return null;

  // Convert age from date_of_birth
  const today = new Date();
  const birthDate = new Date(user.date_of_birth);
  const age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed = (
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate())
  );
  const finalAge = hasBirthdayPassed ? age : age - 1;

  return {
    first_name: user.first_name,
    last_name: user.last_name,
    age: finalAge,
    gender: user.gender,
    interests: user.interests,
    looking_for: user.looking_for,
    avatar: user.avatar,
    images: user.images || [],
    description: user.description,
    smoking_status: user.smoking_status,
    profession: user.profession,
    looking_for: user.looking_for,
    relationship_goal: user.relationship_goal,
    children: user.children
  };

}

/*
* user.account()
* get a list of accounts this user is attached to
*/

exports.account = async function({ id, permission }){

  const data = await User.aggregate([
    { $match: { id: id }},
    { $project: { id: 1, account: 1, email: 1 }},
    { $lookup: {

      from: 'account',
      localField: 'account.id',
      foreignField: 'id',
      as: 'account_data'
        
     }}
  ]);
  // format
  return data[0]?.account.map(a => { 
    return {

      id: a.id,
      user_id: data[0].id,
      permission: a.permission,
      name: data[0].account_data.find(x => x.id === a.id)?.name,
      email: data[0].email,
      virtual_currency: data[0].account_data.find(x => x.id === a.id)?.virtual_currency || 0
    }
  });
}

/*
* user.account.add()
* assign a user to an account
*/

exports.account.add = async function({ id, account, permission }){

  const data = await User.findOne({ id: id });

  if (data){

    data.account.push({ id: account, permission: permission, onboarded: false });
    data.markModified('account');
    return await data.save();

  }

  throw { message: `No user with that ID` };

}

/*
* user.account.delete()
* remove a user from an account
*/

exports.account.delete = async function({ id, account }){

  const data = await User.findOne({ id: id });

  if (data){

    data.account.splice(data.account.findIndex(x => x.id === account), 1);
    data.markModified('account');
    await data.save();

  }

  return;

}

/*
* user.password()
* return the user hash
*/

exports.password = async function({ id, account }){

  return await User.findOne({ id: id, 'account.id': account })
  .select({ password: 1 });

}

/*
* user.password-verify()
* check the password against the hash stored in the database
*/

exports.password.verify = async function({ id, account, password }){
  
  const data = await User.findOne({ id: id, 'account.id': account })
  .select({ name: 1, email: 1, password: 1 });

  const verified = data?.password ? 
    await bcrypt.compare(password, data.password) : false;

  delete data.password;
  return verified ? data : false;

};

/*
* user.password.save()
* save a new password for the user
* if not executed via a password reset request, the user is notified
* by email that their password has been changed
* passwordReset: true/false to determine of password update is part of reset
*/

exports.password.save = async function({ id, password }){

  // encrypt & save the password
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  return await User.findOneAndUpdate({ id: id },{ password: hash });

}

/*
* user.2fa.secret()
* return the decrypted 2fa secret
*/

exports['2fa'] = {};

exports['2fa'].secret = async function({ id, email }){

  const data = await User.findOne({ 
    
    ...id && { id: id },
    ...email && { email: email } 
  
  }).select({ '2fa_secret': 1 });
  
  return data ? crypto.decrypt(data['2fa_secret']) : null;
 
}

exports['2fa'].backup = {};

/*
* user.2fa.backup.save()
* hash and save the users backup code
*/

exports['2fa'].backup.save = async function({ id, code }){

  // encrypt & save the backup code
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(code, salt);
  return await User.findOneAndUpdate({ id: id },{ '2fa_backup_code': hash });

}

/*
* user.2fa.backup.verify()
* verify the users 2fa backup code
*/

exports['2fa'].backup.verify = async function({ id, email, account, code }){

  const data = await User.findOne({
    
    ...id && { id: id, 'account.id': account },
    ...email && { email: email },
      
  }).select({ '2fa_backup_code': 1 });

  return data?.['2fa_backup_code'] ? await bcrypt.compare(code, data['2fa_backup_code']) : false;

}

/*
* user.update()
* update the user profile
* profile: object containing the user data to be saved
*/

exports.update = async function({ _id, id, account, data }){

  if (data?.name)
    data.name = escape(data.name);

  // update nested objects
  if (data?.onboarded || data?.permission){

    const doc = await User.findOne({ ..._id ? {_id } : {id: id}, 'account.id': account });
    if (!doc) throw { message: `No user with that ID` };
    
    const index = doc.account.findIndex(x => x.id === account);

    if (data.onboarded) {
      doc.account[index].onboarded = data.onboarded;
      doc.onboarded = data.onboarded;
    }

    if (data.permission)
    doc.account[index].permission = data.permission;

    doc.markModified('account');
    doc.save();
  
  }
  else {
    
    const userCurrent = await User.findOneAndUpdate({ ..._id ? {_id: _id } : {id: id}, ...(account ? {'account.id': account} : {}) }, data);
    data.is_invited = userCurrent.is_invited
    data.avatar = userCurrent.avatar
  }

  return data;

}

/*
* user.updatePhotoProfile()
* update the user
*/

exports.updatePhotoProfile = async function({ id, avatar, step, onboarded }){

  const doc = await User.findOne({ id: id }).select('_id id');
  
  return await User.findOneAndUpdate({ _id: doc._id }, {
    ...step && { step },
    avatar,
    images: [avatar],
    ...(onboarded !== undefined ? { onboarded, 'account.$[].onboarded': onboarded } : {})

  },
  { new: true }
  );
};

/*
* user.updateAvatar()
* update the user
*/

exports.updateAvatar = async function({ id, avatar }){

  const doc = await User.findOne({ id: id }).select('_id id');
  
  return await User.findOneAndUpdate({ _id: doc._id }, {
    avatar
  },
  { new: true }
  );
};

/*
* user.updateUserPhotos()
* update the user
*/

exports.updateUserPhotos = async function({ id, image, action }) {
  const doc = await User.findOne({ id }).select('_id id');
  if (!doc) throw new Error('User not found');

  const update =
    action === 'add'
      ? { $addToSet: { images: image } }
      : action === 'remove'
      ? { $pull: { images: image } }
      : {};

  return await User.findOneAndUpdate({ _id: doc._id }, update, { new: true });
};


/*
* user.delete()
* delete the user
*/

exports.delete = async function({ id, account }){

  return await User.deleteMany({

    ...id && { id: id },
    'account.id': account

  });
};