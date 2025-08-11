const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MatchInteractionSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  target_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  event_id: { type: Schema.Types.ObjectId, ref: 'EventManagement', required: true },
  direction: { type: String, enum: ['left', 'right', 'superlike', 'confirmed_superlike', 'rejected_superlike'], required: true }
}, {
  indexes: [
    { user_id: 1, target_id: 1, event_id: 1 }, // Prevent duplicate swipes
  ],
  timestamps: true
});

// Model
const MatchInteraction = mongoose.model('MatchInteraction', MatchInteractionSchema, 'matching-interactions');
exports.schema = MatchInteraction;

exports.findOneAndUpdate = async function({userId, targetId, eventId, direction}) {
  return await MatchInteraction.findOneAndUpdate(
        { user_id: userId, target_id: targetId, event_id: eventId },
        { direction },
        { upsert: true, new: true }
      );
}

exports.findOne = async function({userId, targetId, eventId, direction}) {
  return await MatchInteraction.findOne({
        user_id: userId,
        ...targetId && {target_id: targetId},
        event_id: eventId,
        ...direction && {direction: { $in: direction }}
      }).sort({ createdAt: -1 });
}

exports.deleteOne = async function({id}) {
  return await MatchInteraction.deleteOne({ _id: id });
}

exports.find = async function({currentUserId, eventId, direction, targetId }) {
  return await MatchInteraction.find({
    ...currentUserId && { user_id: currentUserId },
    ...targetId && { target_id: { $in: targetId } },
    direction: { $in: direction },
    event_id: eventId
  });
}

