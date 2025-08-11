const mongoose = require('mongoose');
const { Schema } = mongoose;

const GroupSchema = new Schema({
  event_id: { type: Schema.Types.ObjectId, ref: 'EventManagement', required: true },
  slot: { type: Number, required: true },
  group_name: { type: String, required: true },
  age_group: { type: String, enum: ['18–30', '31–40', '41–50+'], required: true },
  bar_id: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  team_ids: [{ type: Schema.Types.ObjectId, ref: 'Team', required: true }],
  status: { type: String, default: 'Active'},
  method: { type: String, default: 'assigned by AI' }
}, { timestamps: true });

const Group = mongoose.model('Group', GroupSchema, 'groups');
exports.schema = Group;

/*
* group.get()
*/
exports.get = async function ({ eventId }) {
  const data = await Group.aggregate([
    {
      $match: {
        event_id: new mongoose.Types.ObjectId(eventId),
      },
    },
    {
      $lookup: {
        from: 'teams',
        localField: 'team_ids',
        foreignField: '_id',
        as: 'teams',
      },
    },
    {
      $addFields: {
        total_members: {
          $sum: {
            $map: {
              input: '$teams',
              as: 'team',
              in: { $size: '$$team.members' },
            },
          },
        },
      },
    },
    {
      $sort: { createdAt: -1 }
    }
  ]);

  return data;
};

/*
* group.getById()
*/
exports.getById = async function ({ id }) {
  const data = await Group.findOne({ _id: new mongoose.Types.ObjectId(id) })
    .populate({
      path: 'team_ids',
      populate: {
        path: 'members',
        model: 'User',
        select: 'name first_name last_name'
      }
    })
    .populate('bar_id', 'name address');

  return data;
};

/*
* group.getByTeamId()
*/
exports.getByTeamId = async function ({ id }) {
  const data = await Group.find({
    team_ids: new mongoose.Types.ObjectId(id)
  }).populate({
    path: 'bar_id',
    select: 'name address'
  });

  return data;
};