const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Transaction = require('./transaction').schema;
const MatchInteraction = require('./matching-interaction').schema;

// Main schema
const RegisteredParticipantSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  event_id: { type: Schema.Types.ObjectId, ref: 'EventManagement', required: true },
  first_name: { type: String },
  last_name: { type: String },
  gender: { type: String, enum: ['male', 'female'], default: null },
  date_of_birth: { type: Date },
  email: { type: String, required: true },
  status: {
    type: String,
    enum: ['process', 'registered', 'canceled', 'cancelled'],
    default: 'registered'
  },
  is_main_user: { type: Boolean, default: null },
  is_cancelled: { type: Boolean, default: null },
  cancel_date: { type: Date },
  cancellation_date: { type: Date },
  cancellation_type: { type: String, enum: ['timely', 'late', 'admin', 'admin_group', 'admin_team'] },
  voucher_code: { type: String },
  voucher_amount: { type: Number },
  looking_for: { type: String },
  relationship_goal: { type: String, default: null },
  children: { type: Boolean, default: null },
  kind_of_person: { type: String, default: null },
  feel_around_new_people: { type: String, default: null },
  prefer_spending_time: { type: String, default: null },
  describe_you_better: { type: String, default: null },
  describe_role_in_relationship: { type: String, default: null },
  group_id: { type: Schema.Types.ObjectId, ref: 'Group', default: null },
  team_id: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
}, { versionKey: false, timestamps: true });

// Model
const RegisteredParticipant = mongoose.model('RegisteredParticipant', RegisteredParticipantSchema, 'registered-participants');
exports.schema = RegisteredParticipant;

/*
 * registeredParticipant.create()
 */
exports.create = async function (registration) {

  const data = new RegisteredParticipant({
    user_id: registration.user_id,
    event_id: registration.event_id,
    first_name: registration.first_name,
    last_name: registration.last_name,
    gender: registration.gender || null,
    date_of_birth: registration.date_of_birth,
    email: registration.email,
    status: registration.status || 'registered',
    is_main_user: registration.is_main_user,
    looking_for: registration.looking_for,
    relationship_goal: registration.relationship_goal,
    children: registration.children,
    kind_of_person: registration.kind_of_person,
    feel_around_new_people: registration.feel_around_new_people,
    prefer_spending_time: registration.prefer_spending_time,
    describe_you_better: registration.describe_you_better,
    describe_role_in_relationship: registration.describe_role_in_relationship
  });

  await data.save();
  return data;
};

/*
* registeredParticipant.findOneAndUpdate()
*/
exports.findOneAndUpdate = async function ({ id }, data) {

  return await RegisteredParticipant
    .findOneAndUpdate({ _id: id }, data);
};

exports.getNearestUpcomingEvent = async function ({ id }) {
  const now = new Date();

  if (!id) return null;

  // 1. Find nearest upcoming event for the user
  const nearest = await RegisteredParticipant.aggregate([
    { $match: { user_id: new mongoose.Types.ObjectId(id), status: 'registered' } },
    {
      $lookup: {
        from: 'event-management', // collection name in MongoDB (check this!)
        localField: 'event_id',
        foreignField: '_id',
        as: 'event',
      }
    },
    { $unwind: '$event' },
    { $match: { 'event.date': { $gte: now } } },
    { $sort: { 'event.date': 1 } },
    { $limit: 1 }
  ]);

  const upcoming = nearest?.[0];
  if (!upcoming) return null;

  const eventId = upcoming.event._id;

  // 2. Find invited friends registered by the user for this event
  let invitedFriends; 
  if(upcoming.is_main_user){
    invitedFriends = await Transaction.find({
      user_id: id,
      event_id: eventId,
      invited_user_id: { $ne: null },
      type: 'Register Event'
    })
      .populate('invited_user_id', 'first_name last_name email name') // populate invited user details
      .lean();
  } else {
    invitedFriends = await Transaction.find({
      invited_user_id: new mongoose.Types.ObjectId(id),
      event_id: eventId,
      type: 'Register Event'
    })
      .populate('user_id', 'first_name last_name email name') // populate invited user details
      .lean();
  }

  // 3. Return the event with invited friends
  return {
    event: upcoming.event,
    invited_friends: invitedFriends.map(tx => upcoming.is_main_user ? tx.invited_user_id : tx.user_id)
  };
};

exports.getPastEvent = async function ({ id }) {
  const now = new Date();

  if (!id) return [];

  const objectId = new mongoose.Types.ObjectId(id);

  const pastEvents = await RegisteredParticipant.aggregate([
    {
      $match: {
        user_id: objectId,
        status: 'registered',
        is_draft: { $in: [false, null] },
        is_canceled: { $in: [false, null] }
      }
    },
    // Join with event
    {
      $lookup: {
        from: 'event-management',
        localField: 'event_id',
        foreignField: '_id',
        as: 'event'
      }
    },
    { $unwind: '$event' },
    { $match: { 'event.date': { $lt: now } } },
    
    // Join with city
    {
      $lookup: {
        from: 'city',
        localField: 'event.city',
        foreignField: '_id',
        as: 'event.city'
      }
    },
    { $unwind: { path: '$event.city', preserveNullAndEmptyArrays: true } },

    // Join with teams to get team ID (indirect, based on assumption)
    {
      $lookup: {
        from: 'teams',
        let: { eventId: '$event_id', userId: '$user_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$event_id', '$$eventId'] },
                  { $in: ['$$userId', '$members'] }
                ]
              }
            }
          }
        ],
        as: 'user_team'
      }
    },
    { $unwind: '$user_team' },

    // Join with group where slot = 1 and group contains user's team
    {
      $lookup: {
        from: 'groups',
        let: { eventId: '$event_id', teamId: '$user_team._id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$event_id', '$$eventId'] },
                  { $eq: ['$slot', 1] },
                  { $in: ['$$teamId', '$team_ids'] }
                ]
              }
            }
          },
          {
            $lookup: {
              from: 'location',
              localField: 'bar_id',
              foreignField: '_id',
              as: 'bar'
            }
          },
          { $unwind: { path: '$bar', preserveNullAndEmptyArrays: true } }
        ],
        as: 'group'
      }
    },
    { $unwind: { path: '$group', preserveNullAndEmptyArrays: true } },

    // Select only the necessary fields
    {
      $project: {
        event: 1,
        group: {
          _id: 1,
          slot: 1,
          group_name: 1,
          bar: {
            _id: 1,
            name: 1,
            address: 1,
            image: 1,
            contact_person: 1,
            contact_details: 1
          }
        }
      }
    },
    { $sort: { 'event.date': -1 } },
    { $limit: 5 }
  ]);

  return pastEvents || [];
};


exports.getParticipants = async function ({ userId, eventId }) {
  if (!userId || !eventId) return [];
  const swipedTargetIds = await MatchInteraction.find({ user_id: userId, event_id: eventId })
    .distinct('target_id');
  const participants = await RegisteredParticipant.find({
      event_id: eventId,
      user_id: { $ne: userId, $nin: swipedTargetIds }, // Exclude the current user
      status: 'registered',
      is_canceled: { $in: [false, null] }
    }).populate({
      path: 'user_id',
      select: 'first_name last_name gender date_of_birth interests looking_for profession smoking_status description images avatar',
    });

  const formatted = participants.map((participant) => ({
      _id: participant.user_id._id,
      first_name: participant.user_id.first_name,
      last_name: participant.user_id.last_name,
      gender: participant.user_id.gender,
      date_of_birth: participant.user_id.date_of_birth,
      interests: participant.user_id.interests,
      looking_for: participant.user_id.looking_for,
      profession: participant.user_id.profession,
      smoking_status: participant.user_id.smoking_status,
      description: participant.user_id.description,
      images: participant.user_id.images,
      avatar: participant.user_id.avatar,
    }));
  return formatted
};

exports.getPendingParticipants = async function ({ pendingIds, userId, eventId }) {
  if (!pendingIds || !eventId || !userId) return [];

  // Fetch target users where the current user has NOT already confirmed/rejected the superlike
  const handledSuperlikes = await MatchInteraction.find({
    user_id: userId,
    target_id: { $in: pendingIds },
    event_id: eventId,
    direction: { $in: ['confirmed_superlike', 'rejected_superlike'] }
  }).distinct('target_id');

  const filteredPendingIds = pendingIds.filter(id => !handledSuperlikes.includes(id.toString()));

  if (!filteredPendingIds.length) return [];

  const participants = await RegisteredParticipant.find({
    event_id: eventId,
    user_id: { $in: filteredPendingIds }
  }).populate({
    path: 'user_id',
    select: 'first_name last_name gender date_of_birth interests looking_for profession smoking_status description images avatar',
  });

  const formatted = participants.map((participant) => ({
    _id: participant.user_id._id,
    first_name: participant.user_id.first_name,
    last_name: participant.user_id.last_name,
    gender: participant.user_id.gender,
    date_of_birth: participant.user_id.date_of_birth,
    interests: participant.user_id.interests,
    looking_for: participant.user_id.looking_for,
    profession: participant.user_id.profession,
    smoking_status: participant.user_id.smoking_status,
    description: participant.user_id.description,
    images: participant.user_id.images,
    avatar: participant.user_id.avatar,
  }));

  return formatted;
};

exports.getLatestActiveEventByUser = async function (userId) {
  if (!userId) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const twentyEightDaysFromNow = new Date(today.getTime() + 28 * 24 * 60 * 60 * 1000);
  const uid = new mongoose.Types.ObjectId(userId);

  const result = await RegisteredParticipant.aggregate([
    {
      $match: {
        user_id: uid,
        status: 'registered',
        is_cancelled: { $in: [false, null] }
      }
    },
    {
      $lookup: {
        from: 'event-management',
        localField: 'event_id',
        foreignField: '_id',
        as: 'event'
      }
    },
    { $unwind: '$event' },
    {
      $addFields: {
        eventDate: '$event.date',
        validUntil: {
          $add: ['$event.date', 1000 * 60 * 60 * 24 * 28]
        }
      }
    },
    {
      $match: {
        eventDate: { $lte: twentyEightDaysFromNow },
        validUntil: { $gte: today }
      }
    },
    {
      $replaceRoot: { newRoot: '$event' }
    },
    {
      $sort: { date: -1 } // latest first
    },
    { $limit: 1 }
  ]);

  return result[0] || null;
};

/*
 * registeredParticipant.getById()
 */
exports.getById = async function ({ id }) {
  return await RegisteredParticipant.findById(id);
};

/*
 * registeredParticipant.update()
 */
exports.update = async function ({ id, data }) {
  return await RegisteredParticipant.findByIdAndUpdate(id, data, { new: true });
};

/*
 * registeredParticipant.getUserRegistrations()
 */
exports.getUserRegistrations = async function ({ user_id }) {
  return await RegisteredParticipant.find({
    user_id: user_id,
    status: { $in: ['registered', 'process'] }
  }).populate({
    path: 'event_id',
    populate: {
      path: 'city',
      model: 'City',
      select: 'name'
    }
  }).lean();
};

/*
 * registeredParticipant.getByEventId()
 * Get all participants for a specific event
 */
exports.getByEventId = async function ({ event_id }) {
  return await RegisteredParticipant.find({
    event_id: event_id,
    status: { $in: ['registered', 'process'] }
  }).populate({
    path: 'user_id',
    select: 'first_name last_name email'
  });
};

/*
 * registeredParticipant.getByGroupId()
 * Get all participants for a specific group
 */
exports.getByGroupId = async function ({ group_id }) {
  return await RegisteredParticipant.find({
    group_id: group_id,
    status: { $in: ['registered', 'process'] }
  }).populate({
    path: 'user_id',
    select: 'first_name last_name email'
  });
};

/*
 * registeredParticipant.getByTeamId()
 * Get all participants for a specific team
 */
exports.getByTeamId = async function ({ team_id }) {
  return await RegisteredParticipant.find({
    team_id: team_id,
    status: { $in: ['registered', 'process'] }
  }).populate({
    path: 'user_id',
    select: 'first_name last_name email'
    });
};

/*
 * registeredParticipant.getCancelledByEventId()
 * Get all cancelled participants for a specific event
 */
exports.getCancelledByEventId = async function ({ event_id }) {
  return await RegisteredParticipant.find({
    event_id: event_id,
    status: 'cancelled'
  }).populate({
    path: 'user_id',
    select: 'first_name last_name email'
  });
};

/*
 * registeredParticipant.getCancellationStats()
 * Get cancellation statistics for an event
 */
exports.getCancellationStats = async function ({ event_id }) {
  const stats = await RegisteredParticipant.aggregate([
    { $match: { event_id: new mongoose.Types.ObjectId(event_id) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const result = {
    total: 0,
    registered: 0,
    cancelled: 0,
    process: 0
  };
  
  stats.forEach(stat => {
    result.total += stat.count;
    result[stat._id] = stat.count;
  });
  
  return result;
};