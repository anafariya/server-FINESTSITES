const event = require('../model/event-management');
const utility = require('../helper/utility');
const mongoose = require('mongoose');
const s3 = require('../helper/s3');
const path = require('path');
const registeredParticipant = require('../model/registered-participant');
const user = require('../model/user');
const matchInteraction = require('../model/matching-interaction');
const confirmedMatch = require('../model/confirm-match');
const account = require('../model/account');
const chatMessage = require('../model/chat-message');
const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.ENCRYPT_KEY; // Must be 32 bytes for AES-256
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

/*
 * chat.getInboxLists()
 */
exports.getInboxLists = async function (req, res) {
  try {
    const id = req.user;
    const eventId = req.params.id;

    const { page = 1, limit = 10 } = req.query; // default values
    const skip = (page - 1) * limit;

    const userData = await user.get({ id });
    const userId = new mongoose.Types.ObjectId(userData._id);

    const matches = await confirmedMatch.getUserMatches(userId, page, Number(limit));
    
    const data = await Promise.all(matches?.data?.map(async (match) => {
      const matchId = match.chat_id;

      const lastMessage = await chatMessage.findOne({ chatId: matchId });

      const hasUnread = await chatMessage.exists({
        chatId: matchId,
        userId,
        read: false
      });

      let avatar = match.avatar;
      if (avatar) {
        const ext = path.extname(avatar).slice(1);
        avatar = await s3.signedURLView({
          filename: avatar,
          acl: 'bucket-owner-full-control',
          contentType: `image/${ext}`
        });
      }

      return {
        matchId,
        name: match.name,
        avatar,
        matched_at: match.createdAt,
        message: lastMessage?.text ? decrypt(lastMessage?.text) : '',
        time: lastMessage?.sent_at || match.createdAt, // ✅ fallback to matched time
        unread: !!hasUnread,
        sender_id: lastMessage?.sender_id
      };
    }));

    return res.status(200).send({ data });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: 'Server error' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const io = req.app.get('socketio');
    const id = req.user; // current user ID
    const { chatId } = req.params;
    const { before, limit = 20 } = req.query;
    const userData = await user.get({ id });
    const userId = new mongoose.Types.ObjectId(userData._id);
    const filter = { chatId: new mongoose.Types.ObjectId(chatId) };

    if (before) {
      filter.sent_at = { $lt: new Date(before) };
    }

    const messages = await chatMessage.find({...filter, limit})

    const data = await Promise.all(messages
      .reverse() // show oldest first
      .map(async (msg) => {
      let formatted;
      if(msg.images){
        const images = []
        await Promise.all(msg.images.map(async (img) => {
          const ext = await path.extname(img).slice(1);
          const previewSignedUrl = await s3.signedURLView({
            filename: `${img}`,
            acl: 'bucket-owner-full-control',
            // 'public-read',
            contentType: `image/${ext}`,
          });
          images.push(previewSignedUrl);
        }))
        formatted = images
      }
      return {
        ...msg.toObject(),
        text: msg?.text ? decrypt(msg?.text) : '',
        sender: msg.sender_id.equals(userId) ? 'self' : 'other',
        images: formatted
      }
    }));

    const lastMessage = await chatMessage.getLastMessage(new mongoose.Types.ObjectId(chatId));
    if (lastMessage) {
      if((lastMessage.sender_id !== userData._id) && !lastMessage.read){
        io.to(`user_${userData._id}`).emit('message_read', {
          chatId,
          readerId: userData._id,
        });
      }
    }

    // read the message
    await chatMessage.read({
      chatId,
      userId
    })

    return res.status(200).json({
      data,
      hasMore: messages.length === parseInt(limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getChatUserProfile = async (req, res) => {
  try {
    const id = req.user;
    const { chatId } = req.params;

    const curUser = await user.get({ id });

    const match = await confirmedMatch.findOne({
      idChat: new mongoose.Types.ObjectId(chatId),
    });

    if (!match) return res.status(404).json({ message: 'Match not found' });

    const otherUserId = match.user_ids.find(
      (dt) => !new mongoose.Types.ObjectId(dt).equals(curUser._id)
    );

    if (!otherUserId) return res.status(404).json({ message: 'Other user not found' });

    let userData = await user.getProfileOtherUser({
      _id: new mongoose.Types.ObjectId(otherUserId),
    });

    userData._id = otherUserId;
    userData.is_blocked = match.blocked_by?.length ? true : false;

    // Signed avatar
    if (userData?.avatar) {
      const ext = path.extname(userData.avatar).slice(1);
      const previewSignedUrl = await s3.signedURLView({
        filename: userData.avatar,
        acl: 'bucket-owner-full-control',
        contentType: `image/${ext}`,
      });
      userData.avatar = previewSignedUrl;
    }

    // Signed gallery images
    if (userData?.images?.length) {
      const signedImgs = await Promise.all(
        userData.images.map(async (img) => {
          const ext = path.extname(img).slice(1);
          const previewSignedUrl = await s3.signedURLView({
            filename: img,
            acl: 'bucket-owner-full-control',
            contentType: `image/${ext}`,
          });
          return previewSignedUrl;
        })
      );
      userData.images = signedImgs;
    }

    return res.status(200).json({ user: userData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const io = req.app.get('socketio');
    const id = req.user;
    const { chatId } = req.params;
    const { text } = req.body;
    const userData = await user.get({ id });
    const userId = new mongoose.Types.ObjectId(userData._id);
    let images = [];

    // If files are uploaded
    if (req.files && req.files.length > 0) {
      images = await Promise.all(
        req.files.map(async (file) => {
          const ext = path.extname(file.originalname).slice(1);
          const key = `chat-${Date.now()}.${ext}`
          await s3.upload({ key, file });
          return key;
        })
      );
    }

    const message = await chatMessage.create({
      chatId, senderId: userId, text: encrypt(text), images
    });
    const messagePlain = message.toObject();
    io.to(chatId).emit('new_message', {
      chatId,
      message: {
        ...messagePlain,
        text: messagePlain.text && decrypt(messagePlain.text),
        sender: 'other',
      }
    });
    const chat = await confirmedMatch.findOne({idChat: new mongoose.Types.ObjectId(chatId)});
    
    if(chat){
      const targetId = chat?.user_ids;
      
      targetId?.length && targetId.map((dt) => {
        io.to(`user_${dt.toString()}`).emit('update_inbox', {
          matchId: chatId,
          lastMessage: {
            ...messagePlain,
            text: messagePlain.text && decrypt(messagePlain.text),
            unread: true,
          },
        })
      })
    }

    res.status(201).json({ message });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

exports.blockUser = async (req, res) => {
  try {
    const idUser = req.user;
    const userData = await user.get({ id: idUser });
    const userId = userData._id;
    const { chatId } = req.params;
    const { reason } = req.body;
    if (!userId || !chatId) {
      return res.status(400).json({ message: res.__('matching_room.invalid') });
    }

    const match = await confirmedMatch.update({
      chatId: new mongoose.Types.ObjectId(chatId),
      data: {
        blocked_by: userId,
        block_reason: reason,
        block_date: new Date(),
      }
    });
    return res.status(200).json({ block: true, message: res.__('matching_room.blocked') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.readMessages = async (req, res) => {
  try {
    const id = req.user;
    const { chatId } = req.params;
    const userData = await user.get({ id });
    const userId = new mongoose.Types.ObjectId(userData._id);

    // read the message
    await chatMessage.read({
      chatId,
      userId
    })

    return res.status(200).json({
      data: 'read',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getCountUnreadMessages = async (req, res) => {
  try {
    const id = req.user;
    const userData = await user.get({ id });
    const userId = new mongoose.Types.ObjectId(userData._id);
    const counted = await chatMessage.unreadCount({
      userId
    })

    return res.status(200).json({
      data: counted,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};