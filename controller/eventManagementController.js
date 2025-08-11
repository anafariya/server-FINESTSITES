const event = require('../model/event-management');
const utility = require('../helper/utility');
const mongoose = require('mongoose');
const s3 = require('../helper/s3');
const path = require('path');
const registeredParticipant = require('../model/registered-participant');
const user = require('../model/user');

/*
 * event.get()
 */
exports.get = async function (req, res) {
  try {
    const { search = '', city = '', status = '', barId = '' } = req.query;
    const query = {};

    if (city) query.city = city;
    if (status) query.status = status;
    if (barId) query['bars._id'] = barId;

    if (search) {
      
    }
    const id = req.user
    const userData = await user.get({ id: id });

    query.user_id = new mongoose.Types.ObjectId(userData._id);

    const events = await event.get(query);
    const data = await Promise.all(events.map(async (dt) => {
      const obj = dt
      // .toObject()
      if(obj.image){
        const ext = await path.extname(obj.image).slice(1);
        const previewSignedUrl = await s3.signedURLView({
          filename: `${obj.image}`,
          acl: 'bucket-owner-full-control',
          // 'public-read',
          contentType: `image/${ext}`,
        });
        obj.image = previewSignedUrl;
      }
      return {
        ...obj
      }
    }))
    
    return res.status(200).send({ data: data });
  } catch (err) {
    return res.status(500).send({ error: err.message });
  }
};

/*
 * event.dashboard()
 */
exports.dashboard = async function (req, res) {
  try {
    const id = req.user
    const userData = await user.get({ id: id });

    const dataEvent = await registeredParticipant.getNearestUpcomingEvent({ id: new mongoose.Types.ObjectId(userData._id) })

    if(dataEvent?.event){
      if(dataEvent.event?.image){
        const ext = await path.extname(dataEvent.event.image).slice(1);
        const previewSignedUrl = await s3.signedURLView({
          filename: `${dataEvent.event.image}`,
          acl: 'bucket-owner-full-control',
          // 'public-read',
          contentType: `image/${ext}`,
        });
        dataEvent.event.image = previewSignedUrl;
      }
    }
    const pastEvents = await registeredParticipant.getPastEvent({ id: new mongoose.Types.ObjectId(userData._id) })
    return res.status(200).send({ data: {
      upcoming: dataEvent,
      past: pastEvents
    } });
  } catch (err) {
    return res.status(500).send({ error: err.message });
  }
};

/*
 * event.getById()
 */
exports.getById = async function (req, res) {
  const id = req.params.id;

  try {
    utility.validate(id);
    const eventData = await event.getById({ id: new mongoose.Types.ObjectId(id) });
    if(eventData){
      const ext = await path.extname(eventData.image).slice(1);
      const previewSignedUrl = await s3.signedURLView({
        filename: `${eventData.image}`,
        acl: 'bucket-owner-full-control',
        // 'public-read',
        contentType: `image/${ext}`,
      });
      eventData.image = previewSignedUrl;
    }
    return res.status(200).send({ data: eventData });
  } catch (err) {
    return res.status(400).send({ error: err.message });
  }
};

/*
 * event.getMatchingEvents()
 */
exports.getMatchingEvents = async function (req, res) {
  try {
    const id = req.user
    const userData = await user.get({ id: id });

    const userId = new mongoose.Types.ObjectId(userData._id);

    const events = await event.getMatchingEvents(userId);
    const data = await Promise.all(events.map(async (dt) => {
      const obj = dt
      // .toObject()
      if(obj.image){
        const ext = await path.extname(obj.image).slice(1);
        const previewSignedUrl = await s3.signedURLView({
          filename: `${obj.image}`,
          acl: 'bucket-owner-full-control',
          // 'public-read',
          contentType: `image/${ext}`,
        });
        obj.image = previewSignedUrl;
      }
      return {
        ...obj
      }
    }))
    
    return res.status(200).send({ data: data });
  } catch (err) {
    return res.status(500).send({ error: err.message });
  }
};

/*
 * event.getPublicEvents()
 */
exports.getPublicEvents = async function (req, res) {
  try {
    const { search = '', city = '', status = '', barId = '' } = req.query;
    const query = {};

    if (city) query.city = city;
    if (status) query.status = status;
    if (barId) query['bars._id'] = barId;

    if (search) {
      
    }

    const events = await event.get(query);
    const data = await Promise.all(events.map(async (dt) => {
      const obj = dt
      // .toObject()
      if(obj.image){
        const ext = await path.extname(obj.image).slice(1);
        const previewSignedUrl = await s3.signedURLView({
          filename: `${obj.image}`,
          acl: 'bucket-owner-full-control',
          // 'public-read',
          contentType: `image/${ext}`,
        });
        obj.image = previewSignedUrl;
      }
      return {
        ...obj
      }
    }))
    
    return res.status(200).send({ data: data });
  } catch (err) {
    return res.status(500).send({ error: err.message });
  }
};