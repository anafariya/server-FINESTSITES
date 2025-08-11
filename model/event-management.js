const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const moment = require('moment-timezone');

// Reference Location model
const Location = require('./location').schema;
const City = require('./city').schema;

// Bar sub-schema referencing Location
const BarReferenceSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  available_spots: { type: Number, required: true },
}, { _id: false });

const EventManagementSchema = new Schema({
  date: { type: Date, required: true },
  city: { type: Schema.Types.ObjectId, ref: 'City', required: true },
  bars: { type: [BarReferenceSchema], required: true },
  start_time: { type: String, required: true }, // e.g., '18:00'
  end_time: { type: String, required: true },   // e.g., '23:00'
  image: { type: String, default: '' },
  is_draft: { type: Boolean, default: false },
  is_canceled: { type: Boolean, default: false },
  tagline: { type: String, required: true },
  capacity_warning_sent: { type: Boolean, default: false }, // Track if 90% warning sent
}, { timestamps: true });

const EventManagement = mongoose.model('EventManagement', EventManagementSchema, 'event-management');
exports.schema = EventManagement;

// Get all events with optional filters
exports.get = async function ({ search = '', city = '', user_id = null }) {
  const today = moment().tz('Europe/Berlin').startOf('day').toDate(); // start of today

  const matchStage = {
    $and: [
      { date: { $gte: today } }, // ✅ Filter for upcoming/today's events only
      { $or: [{ is_draft: false }, { is_draft: { $exists: false } }] },
      { $or: [{ is_canceled: false }, { is_canceled: { $exists: false } }] }
    ]
  };

  if (city) {
    matchStage.$and.push({ city: new mongoose.Types.ObjectId(city) });
  }

  if (search) {
    const cityMatches = await mongoose.model('City').find({
      name: { $regex: search, $options: 'i' }
    }).select('_id');
    const matchedCityIds = cityMatches.map(c => c._id);

    matchStage.$and.push({
      $or: [
        { status: { $regex: search, $options: 'i' } },
        { city: { $in: matchedCityIds } }
      ]
    });
  }

  const pipeline = [
    { $match: matchStage },

    // Lookup City
    {
      $lookup: {
        from: 'city',
        localField: 'city',
        foreignField: '_id',
        as: 'city'
      }
    },
    { $unwind: { path: '$city', preserveNullAndEmptyArrays: true } },

    // Lookup Bars
    {
      $unwind: {
        path: '$bars',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $lookup: {
        from: 'location',
        localField: 'bars._id',
        foreignField: '_id',
        as: 'bar_info'
      }
    },
    {
      $unwind: {
        path: '$bar_info',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $group: {
        _id: '$_id',
        date: { $first: '$date' },
        city: { $first: '$city' },
        start_time: { $first: '$start_time' },
        end_time: { $first: '$end_time' },
        tagline: { $first: '$tagline' },
        image: { $first: '$image' },
        is_draft: { $first: '$is_draft' },
        is_canceled: { $first: '$is_canceled' },
        bars: {
          $push: {
            _id: '$bars._id',
            available_spots: '$bars.available_spots',
            name: '$bar_info.name',
            address: '$bar_info.address',
            image: '$bar_info.image',
            contact_person: '$bar_info.contact_person',
            contact_details: '$bar_info.contact_details'
          }
        }
      }
    },

    // Lookup to check if the user has registered
    ...(user_id ? [
      {
        $lookup: {
          from: 'registered-participants',
          let: { eventId: '$_id', userId: new mongoose.Types.ObjectId(user_id) },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$event_id', '$$eventId'] },
                    { $eq: ['$user_id', '$$userId'] },
                    { $eq: ['$status', 'registered'] },
                    {
                      $or: [
                        { $eq: ['$is_cancelled', false] },
                        { $not: ['$is_cancelled'] } // also checks if it doesn't exist
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: 'user_registered'
        }
      },
      {
        $addFields: {
          is_registered: { $gt: [{ $size: '$user_registered' }, 0] }
        }
      },
      {
        $project: {
          user_registered: 0
        }
      }
    ] : []),
    {
      $sort: { date: -1 } // sort by most recent first
    }
  ];

  const results = await mongoose.model('EventManagement').aggregate(pipeline);
  return results;
};

exports.getMatchingEvents = async function (userId) {
  if (!userId) return [];

  const today = moment().tz('Europe/Berlin').startOf('day').toDate(); // start of today

  const uid = new mongoose.Types.ObjectId(userId);

  const pipeline = [
    // 1. Filter out drafts and canceled events
    { 
      $match: { 
        $and: [
          { is_draft: { $in: [false, null] } },
          { is_canceled: { $in: [false, null] } }
        ]
      }
    },

    // 2. Lookup City
    {
      $lookup: {
        from: 'city',
        localField: 'city',
        foreignField: '_id',
        as: 'city'
      }
    },
    { $unwind: { path: '$city', preserveNullAndEmptyArrays: true } },

    // 3. Lookup Bars
    { $unwind: { path: '$bars', preserveNullAndEmptyArrays: true }},
    {
      $lookup: {
        from: 'location',
        localField: 'bars._id',
        foreignField: '_id',
        as: 'bar_info'
      }
    },
    { $unwind: { path: '$bar_info', preserveNullAndEmptyArrays: true } },

    // 4. Lookup registration to ensure user paid
    {
      $lookup: {
        from: 'registered-participants',
        let: { eid: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$event_id', '$$eid'] },
                  { $eq: ['$user_id', uid] },
                  { $eq: ['$status', 'registered'] },
                  { $or: [{ $eq: ['$is_cancelled', false] }, { $not: ['$is_cancelled'] }] }
                ]
              }
            }
          }
        ],
        as: 'user_registered'
      }
    },
    { $addFields: { is_registered: { $gt: [{ $size: '$user_registered' }, 0] } } },
    { $match: { is_registered: true } },

    // 5. Prevent past event to show
    {
      $addFields: {
        eventStart: {
          $dateFromParts: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            day: { $dayOfMonth: '$date' },
            hour: 0,
            minute: 0,
            second: 0,
            timezone: 'Europe/Berlin'
          }
        },
        eventEnd: {
          $add: [
            '$date',
            1000 * 60 * 60 * 24 * 28 // +28 days
          ]
        }
      }
    },
    {
      $match: {
        $or: [
          { eventStart: { $gte: today } },         // Future or today
          {
            $and: [
              { eventStart: { $lt: today } },      // Past
              { eventEnd: { $gte: today } }        // ...but within 28 days
            ]
          }
        ]
      }
    },

    // 6. Lookup Group (slot 1) with user's team membership
    {
      $lookup: {
        from: 'teams',
        let: { eid: '$_id' },
        pipeline: [
          {
            $match: { $expr: { $and: [
              { $eq: ['$event_id', '$$eid'] },
              { $in: [uid, '$members'] }
            ] } }
          }
        ],
        as: 'user_team'
      }
    },
    { $unwind: { path: '$user_team', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'groups',
        let: { eid: '$_id', tid: '$user_team._id' },
        pipeline: [
          {
            $match: { $expr: { $and: [
              { $eq: ['$event_id', '$$eid'] },
              { $eq: ['$slot', 1] },
              { $in: ['$$tid', '$team_ids'] }
            ] } }
          },
          {
            $lookup: {
              from: 'location',
              localField: 'bar_id',
              foreignField: '_id',
              as: 'group_bar'
            }
          },
          { $unwind: { path: '$group_bar', preserveNullAndEmptyArrays: true } }
        ],
        as: 'group'
      }
    },
    { $unwind: { path: '$group', preserveNullAndEmptyArrays: true } },

    // 7. Final projection and regroup bars
    {
      $group: {
        _id: '$_id',
        date: { $first: '$date' },
        tagline: { $first: '$tagline' },
        image: { $first: '$image' },
        city: { $first: '$city' },
        bars: { 
          $push: {
            _id: '$bars._id',
            available_spots: '$bars.available_spots',
            name: '$bar_info.name',
            address: '$bar_info.address',
            image: '$bar_info.image',
            contact_person: '$bar_info.contact_person',
            contact_details: '$bar_info.contact_details'
          }
        },
        group: { $first: '$group' }
      },
    },

    // 8. Sort and clean up fields
    { $sort: { date: -1 } },
    {
      $project: {
        user_registered: 0,
        is_registered: 0,
        validUntil: 0
      }
    }
  ];

  return mongoose.model('EventManagement').aggregate(pipeline).exec();
};

exports.getById = async function ({ id }) {
  return await EventManagement
    .findOne({ _id: id })
    .populate('city', 'name')
    .populate('bars._id', 'name address image contact_person contact_details');
};