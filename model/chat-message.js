const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ConfirmedMatch = require('./confirm-match').schema;

const ChatMessageSchema = new Schema({
  chat_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ConfirmedMatch',
    required: true,
  },
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
    default: ''
  },
  images: {
    type: [String], // Array of S3 keys or URLs
    default: [],
  },
  read: {
    type: Boolean,
    default: false,
  },
  sent_at: {
    type: Date,
    default: Date.now,
  },
}, {
  versionKey: false,
  timestamps: true,
});

// Model
const ChatMessage = mongoose.model('ChatMessage', ChatMessageSchema, 'chat-message');
exports.schema = ChatMessage;

exports.findOne = async function({chatId}) {
  return await ChatMessage.findOne({
          chat_id: chatId
        })
        .sort({ sent_at: -1 })
        .lean();
}

exports.find = async function({chatId, limit}) {
  return await ChatMessage.find({
          chat_id: chatId
        })
        .sort({ sent_at: -1 })
        .limit(parseInt(limit));
}

exports.exists = async function({chatId, userId, read}) {
  return await ChatMessage.exists({
          chat_id: chatId,
          sender_id: { $ne: userId },
          read
        });
}

exports.create = async function({chatId, senderId, text, images}) {
  return await ChatMessage.create({
      chat_id: chatId,
      sender_id: senderId,
      text,
      images,
      sent_at: new Date(),
    });
}

exports.read = async function({chatId, userId}) {
  return await ChatMessage.updateMany(
      {
        chat_id: chatId,
        sender_id: { $ne: userId }, // Only messages not sent by current user
        read: false,
      },
      { $set: { read: true } }
    );
}

exports.unreadCount = async function({ userId }) {
  const chatUnreadCounts = await ChatMessage.aggregate([
    {
      $match: {
        read: false,
        sender_id: { $ne: userId },
      }
    },
    {
      $lookup: {
        from: 'confirmed-match',
        localField: 'chat_id',
        foreignField: '_id',
        as: 'match'
      }
    },
    { $unwind: '$match' },
    {
      $match: {
        'match.user_ids': userId
      }
    },
    {
      $group: {
        _id: '$chat_id' // group by chat_id → each group = one unread conversation
      }
    },
    {
      $count: 'totalUnreadChats' // count how many unique chat_id groups
    }
  ]);

  return chatUnreadCounts[0]?.totalUnreadChats || 0;
};

exports.getLastMessage = async function (chatId) {
  return await ChatMessage.findOne({ chat_id: chatId })
    .sort({ sent_at: -1 })
    .lean();
};