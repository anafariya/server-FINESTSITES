const event = require('../model/event-management');
const utility = require('../helper/utility');
const mongoose = require('mongoose');
const s3 = require('../helper/s3');
const path = require('path');
const registeredParticipant = require('../model/registered-participant');
const user = require('../model/user');
const MatchInteraction = require('../model/matching-interaction');
const ConfirmedMatch = require('../model/confirm-match');
const Account = require('../model/account');

// --- Constants
const UNDO_COST = 20;
const SUPERLIKE_COST = 20;

/*
 * matchingPhase.getParticipants()
 */
exports.getParticipants = async function (req, res) {
  try {
    const id = req.user
    const eventId = req.params.id;
    const userData = await user.get({ id: id });

    const userId = new mongoose.Types.ObjectId(userData._id);

    const participants = await registeredParticipant.getParticipants({userId, eventId});
    const data = await Promise.all(participants.map(async (dt) => {
      const obj = dt
      // .toObject()
      if(obj.avatar){
        const ext = await path.extname(obj.avatar).slice(1);
        const previewSignedUrl = await s3.signedURLView({
          filename: `${obj.avatar}`,
          acl: 'bucket-owner-full-control',
          // 'public-read',
          contentType: `image/${ext}`,
        });
        obj.avatar = previewSignedUrl;
      }
      if(obj.images){
        const images = []
        await Promise.all(obj.images.map(async (img) => {
          const ext = await path.extname(img).slice(1);
          const previewSignedUrl = await s3.signedURLView({
            filename: `${img}`,
            acl: 'bucket-owner-full-control',
            // 'public-read',
            contentType: `image/${ext}`,
          });
          images.push(previewSignedUrl);
        }))
        obj.images = images;
      }
      return {
        ...obj
      }
    }))
    
    return res.status(200).send({ data: data });
  } catch (err) {
    return res.status(500).send({ message: 'Server error' });
  }
};

exports.handleSwipe = async (req, res) => {
  try {
    const { targetId, eventId, direction } = req.body;
    const idUser = req.user;
    const idAccount = req.account;
    const userData = await user.get({ id: idUser });
    const userId = userData._id
    
    if (!userId || !targetId || !eventId || !direction) {
      return res.status(400).json({ message: res.__('matching_room.invalid') });
    }

    // Validate superlike balance
    if (direction === 'superlike') {
      const account = await Account.get({ id: idAccount });
      if (!account || account.virtual_currency < SUPERLIKE_COST) {
        return res.status(403).json({ message: res.__('matching_room.insufficient_hearts') });
      }

      // Deduct hearts
      await Account.update({ id: idAccount, data: {
        virtual_currency : - UNDO_COST
      } })
    }

    // Save or update swipe
    await MatchInteraction.findOneAndUpdate(
      { userId, targetId, eventId, direction }
    );

    // Handle instant match
    if (['right', 'confirmed_superlike'].includes(direction)) {
      const reverse = await MatchInteraction.findOne({
        userId: targetId,
        targetId: userId,
        eventId: eventId,
        direction: ['right', 'superlike', 'confirmed_superlike']
      });

      if (reverse) {
        const existing = await ConfirmedMatch.findOne({
          userId,
          targetId,
          eventId
        });

        if (!existing) {
          const match = await ConfirmedMatch.create({
            userId,
            targetId,
            eventId
          });

          return res.status(200).json({
            match: true,
            message: res.__('matching_room.matched'),
            chat_id: match._id
          });
        }
      }
    }

    if (direction === 'superlike') {
      return res.status(200).json({
        superlike_sent: true,
        message: res.__('matching_room.superlike_sent')
      });
    }

    res.status(200).json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.confirmSuperlike = async (req, res) => {
  try {
    const { superlikeFromId, eventId, confirm } = req.body;
    const idUser = req.user;
    const userData = await user.get({ id: idUser });
    const userId = userData._id
    if (!userId || !superlikeFromId || !eventId) {
      return res.status(400).json({ message: res.__('matching_room.invalid') });
    }

    if (confirm) {
      await MatchInteraction.findOneAndUpdate(
        { user_id: superlikeFromId, target_id: userId, event_id: eventId, direction: 'confirmed_superlike' }
      );

      const match = await ConfirmedMatch.create({
        userId, 
        targetId: superlikeFromId,
        eventId
      });

      return res.status(200).json({
        match: true,
        message: res.__('matching_room.superlike_confirmed'),
        chat_id: match._id
      });
    } else {
      await MatchInteraction.findOneAndUpdate(
        { userId: superlikeFromId, targetId: userId, eventId: eventId, direction: 'rejected_superlike' }
      );

      return res.status(200).json({ match: false, message: res.__('matching_room.superlike_rejected') });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.undoSwipe = async (req, res) => {
  try {
    const { eventId } = req.body;
    const idUser = req.user;
    const idAccount = req.account;
    const userData = await user.get({ id: idUser });
    const userId = userData._id
    if (!userId || !eventId) {
      return res.status(400).json({ message: res.__('matching_room.not_found') });
    }

    const account = await Account.get({ id: idAccount });
    
    if (!account || account.virtual_currency < UNDO_COST) {
      return res.status(403).json({ message: res.__('matching_room.insufficient_hearts_undo') });
    }

    // Get the most recent swipe by user
    const lastSwipe = await MatchInteraction.findOne({ userId: userId, eventId: eventId });

    if (!lastSwipe) {
      return res.status(404).json({ message: res.__('matching_room.no_recent_swipe') });
    }

    // Delete the swipe interaction
    await MatchInteraction.deleteOne({ id: new mongoose.Types.ObjectId(lastSwipe._id) });

    // Deduct hearts
    await Account.update({ id: idAccount, data: {
      virtual_currency : - UNDO_COST
    } })

    res.status(200).json({
      success: true,
      message: res.__('matching_room.swipe_undone'),
      target_id: lastSwipe.target_id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getIncomingSuperlikes = async (req, res) => {
  const idUser = req.user;
  const { eventId } = req.params;
  try {
    const userData = await user.get({ id: idUser });
    const currentUserId = userData._id
    const superlikes = await MatchInteraction.find({
      targetId: currentUserId,
      direction: ['superlike'],
      eventId
    });

    const superlikers = superlikes.map(i => i.user_id.toString());

    const alreadyHandled = await MatchInteraction.find({
      currentUserId,
      target_id: superlikers,
      direction: ['confirmed_superlike', 'rejected_superlike'],
      eventId
    });

    const handledIds = new Set(alreadyHandled.map(i => i.target_id.toString()));

    const pendingIds = superlikers.filter(id => !handledIds.has(id));

    const pendingUsers = await registeredParticipant.getPendingParticipants({ pendingIds, eventId})

    const data = pendingUsers?.length && await Promise.all(pendingUsers.map(async (dt) => {
        const obj = dt
        // .toObject()
        if(obj.avatar){
          const ext = await path.extname(obj.avatar).slice(1);
          const previewSignedUrl = await s3.signedURLView({
            filename: `${obj.avatar}`,
            acl: 'bucket-owner-full-control',
            // 'public-read',
            contentType: `image/${ext}`,
          });
          obj.avatar = previewSignedUrl;
        }
        if(obj.images){
          const images = []
          await Promise.all(obj.images.map(async (img) => {
            const ext = await path.extname(img).slice(1);
            const previewSignedUrl = await s3.signedURLView({
              filename: `${img}`,
              acl: 'bucket-owner-full-control',
              // 'public-read',
              contentType: `image/${ext}`,
            });
            images.push(previewSignedUrl);
          }))
          obj.images = images;
        }
        return {
          ...obj
        }
      }))

    return res.status(200).send({ data: data });
  } catch (err) {
    return res.status(500).send({ message: 'Server error' });
  }
};

exports.getMatchesWithChats = async (req, res) => {
  try {
    const idUser = req.user;
    const userData = await user.get({ id: idUser });
    const currentUserId = userData._id;
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '15');

    if (!currentUserId) {
      return res.status(400).json({ message: res.__('matching_room.not_found') });
    }

    const { data, total } = await ConfirmedMatch.getUserMatches(currentUserId, page, limit);

    const dataFormatted = data?.length && await Promise.all(data.map(async (dt) => {
        const obj = dt
        if(obj.avatar){
          const ext = await path.extname(obj.avatar).slice(1);
          const previewSignedUrl = await s3.signedURLView({
            filename: `${obj.avatar}`,
            acl: 'bucket-owner-full-control',
            // 'public-read',
            contentType: `image/${ext}`,
          });
          obj.avatar = previewSignedUrl;
        }
        return {
          ...obj
        }
      }))

    res.json({
      success: true,
      data: dataFormatted,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getUnMatched = async (req, res) => {
  try {
    const idUser = req.user;
    const userData = await user.get({ id: idUser });
    const currentUserId = userData._id;
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '15');

    if (!currentUserId) {
      return res.status(400).json({ message: res.__('matching_room.not_found') });
    }

    const { data, total } = await ConfirmedMatch.getUnmatchedParticipants(currentUserId, page, limit);

    const dataFormatted = data?.length && await Promise.all(data.map(async (dt) => {
        const obj = dt
        if(obj.avatar){
          const ext = await path.extname(obj.avatar).slice(1);
          const previewSignedUrl = await s3.signedURLView({
            filename: `${obj.avatar}`,
            acl: 'bucket-owner-full-control',
            // 'public-read',
            contentType: `image/${ext}`,
          });
          obj.avatar = previewSignedUrl;
        }
        return {
          ...obj
        }
      }))

    res.json({
      success: true,
      data: dataFormatted,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.unlockChat = async function (req, res) {
  try {
    const { targetId, eventId } = req.body;
    const idUser = req.user;
    const idAccount = req.account;
    const userData = await user.get({ id: idUser });
    const userId = userData._id
    
    if (!userId || !targetId || !eventId) {
      return res.status(400).json({ message: res.__('matching_room.invalid') });
    }

    const account = await Account.get({ id: idAccount });
    
    const heartCost = 100;
    if ((account.virtual_currency || 0) < heartCost) {
      return res.status(400).json({ message: res.__('matching_room.unlock_chat.insufficient_hearts') });
    }

    // Check if a match already exists
    const existingMatch = await ConfirmedMatch.findOne({
      userId, targetId,
      eventId
    });

    let chat;
    
    if (existingMatch) {
      // If exists and already unlocked, return it
      if (existingMatch.is_unlock_chat) return { success: true, chat_id: existingMatch._id }
    } else {
      // Create new match
      chat = await ConfirmedMatch.create({
        userId, targetId,
        eventId,
        data: {
          is_unlock_chat: true,
          unlock_chat_at: new Date(),
          unlock_chat_by: userId
        }
      });
      // Deduct hearts
      await Account.update({ id: idAccount, data: {
        virtual_currency : - heartCost
      } })
    }

    res.json({ success: true, chat_id: chat._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};