const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TransactionSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  participant_id: { type: Schema.Types.ObjectId, ref: 'RegisteredParticipant' },
  sub_participant_id: { type: [Schema.Types.ObjectId], ref: 'RegisteredParticipant', default: null },
  invited_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  type: {
    type: String,
    enum: ['Buy Hearts', 'Register Event'],
    required: true,
  },
  amount: { type: Number, required: true },
  event_id: { type: Schema.Types.ObjectId, ref: 'EventManagement' },
  status: {
    type: String,
    enum: ['unpaid', 'paid'],
    default: 'unpaid'
  },
  quantity: { type: Number, default: 1 },
}, { versionKey: false, timestamps: true });


const Transaction = mongoose.model('Transaction', TransactionSchema, 'transactions');
exports.schema = Transaction;

/*
* transaction.create()
*/
exports.create = async function (transaction) {
  const data = new Transaction({
    user_id: transaction.user_id,
    ...transaction.participant_id && {participant_id: transaction.participant_id},
    ...transaction.sub_participant_id && {sub_participant_id: transaction.sub_participant_id},
    ...transaction.invited_user_id && {invited_user_id: transaction.invited_user_id},
    type: transaction.type,
    amount: transaction.amount,
    ...transaction.event_id && {event_id: transaction.event_id},
    ...transaction.quantity && {quantity: transaction.quantity},
    status: transaction.status || 'unpaid'
  });
  await data.save();
  return data;
};

/*
* transaction.getById()
*/
exports.getById = async function ({ id, user_id }) {

  return await Transaction
    .findOne({ _id: id, ...user_id && { user_id } })
    .populate({
      path: 'event_id',
      populate: {
        path: 'city',
        model: 'City',
        select: 'name'
      }
    });
};

/*
* transaction.findOneAndUpdate()
*/
exports.findOneAndUpdate = async function ({ id }, data) {

  return await Transaction
    .findOneAndUpdate({ _id: id }, data, { new: true });
};