const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RegisteredParticipant = require('./registered-participant').schema;
const Events = require('./event-management').schema;

const ConfirmedMatchSchema = new Schema({
  user_ids: [
    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  ],
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EventManagement', required: true },
  matched_at: { type: Date, default: Date.now },
  blocked_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  block_reason: { type: String },
  block_date: { type: Date },
  is_unlock_chat: { type: Boolean },
  unlock_chat_at: { type: Date },
  unlock_chat_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  is_archive: { type: Boolean, default: false }
}, { timestamps: true });

// Model
const ConfirmedMatch = mongoose.model('ConfirmedMatch', ConfirmedMatchSchema, 'confirmed-match');
exports.schema = ConfirmedMatch;

exports.findOne = async function({idChat, userId, targetId, eventId}) {
  return await ConfirmedMatch.findOne(idChat ? {
          _id: idChat
        } : {
          user_ids: { $all: [userId, targetId] },
          ...eventId && { event_id: eventId }
        }).sort({ matched_at: -1 });;
}

exports.create = async function({userId, targetId, eventId, data}) {
  return await ConfirmedMatch.create({
          user_ids: [userId, targetId],
          event_id: eventId,
          ...data && {
            ...data
          }
        });
};

exports.update = async function({ userId, targetId, eventId, data = {}, chatId }) {
  const filter = chatId
    ? { _id: chatId }
    : {
        user_ids: { $all: [userId, targetId] },
        event_id: eventId,
      };
  const blockedId = data.blocked_by;
  delete data.blocked_by;
  const updateQuery = {
    $set: data,
    ...blockedId && { $addToSet: { blocked_by: blockedId }},
  };

  return await ConfirmedMatch.findOneAndUpdate(
    filter,
    updateQuery,
    { upsert: true, new: true }
  );
};

exports.getUserMatches = async function(userId, page = 1, limit = 10) {
  const uid = new mongoose.Types.ObjectId(userId);
  const skip = (page - 1) * limit;

  // 1. Find confirmed matches (user is in user_ids)
  const confirmedMatches = await ConfirmedMatch.find({
    user_ids: uid,
    $or: [
      { is_archive: { $exists: false } },
      { is_archive: false }
    ]
  })
    .sort({ matched_at: -1 })
    .skip(skip)
    .limit(limit)
    .populate([
      {
        path: 'user_ids',
        select: 'first_name last_name avatar name'
      },
      {
        path: 'event_id',
        populate: { path: 'city', select: 'name' }
      }
    ]);

  // 2. Total count
  const total = await ConfirmedMatch.countDocuments({ user_ids: uid });

  // 3. Format response
  const data = confirmedMatches.map((match) => {
    const otherUser = match.user_ids.find(u => u._id.toString() !== uid.toString());
    return {
      _id: otherUser._id,
      name: `${otherUser.first_name || otherUser.name} ${otherUser.first_name ? otherUser.last_name : ''}`,
      avatar: otherUser.avatar,
      eventDate: match.event_id?.date,
      city: match.event_id?.city?.name || 'Unknown',
      chat_id: match._id,
      createdAt: match.createdAt
    };
  });

  return { data, total };
};

exports.getUnmatchedParticipants = async function(userId, page = 1, limit = 15) {
  const uid = new mongoose.Types.ObjectId(userId);
  const skip = (page - 1) * limit;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 28); // 28 days ago

  // 1. Find registered events by this user that are in the date range
  const userRegisteredEvents = await RegisteredParticipant.find({
    user_id: uid,
    status: 'registered',
    is_canceled: { $in: [false, null] }
  }).populate({
    path: 'event_id',
    match: {
      is_draft: { $in: [false, null] },
      is_canceled: { $in: [false, null] },
      date: { $lte: today, $gte: startDate }
    }
  });

  // 2. Extract a valid event the user is actually registered to
  const validEvent = userRegisteredEvents.find(e => e.event_id); // populated + matched

  if (!validEvent) return { data: [], total: 0 };

  const eventId = validEvent.event_id._id;

  // 3. Find already matched user_ids
  const matchedUserIds = await ConfirmedMatch.find({
    user_ids: uid,
    event_id: eventId
  }).distinct('user_ids');

  const filteredMatchedIds = matchedUserIds.filter(id => id.toString() !== uid.toString());

  // 4. Find unmatched participants in the same event
  const [total, participants] = await Promise.all([
    RegisteredParticipant.countDocuments({
      event_id: eventId,
      user_id: { $ne: uid, $nin: filteredMatchedIds },
      status: 'registered',
      is_canceled: { $in: [false, null] }
    }),
    RegisteredParticipant.find({
      event_id: eventId,
      user_id: { $ne: uid, $nin: filteredMatchedIds },
      status: 'registered',
      is_canceled: { $in: [false, null] }
    })
      .skip(skip)
      .limit(limit)
      .populate([
        {
          path: 'user_id',
          select: 'name first_name last_name gender avatar date_of_birth description'
        },
        {
          path: 'event_id',
          populate: { path: 'city', select: 'name' }
        }
      ])
  ]);

  const data = participants.map(p => {
    const u = p.user_id;
    return {
      _id: u._id,
      name: `${u.first_name || u.name} ${u.first_name ? u.last_name : ''}`,
      gender: u.gender,
      avatar: u.avatar,
      description: u.description,
      eventDate: p.event_id?.date,
      city: p.event_id?.city?.name || 'Unknown',
      event_id: p.event_id._id
    };
  });

  return { data, total };
};
