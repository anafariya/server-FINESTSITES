const express = require('express');
const auth = require('../model/auth');
const eventManagementController = require('../controller/eventManagementController');
const registeredParticipantController = require('../controller/registerParticipantController');
const api = express.Router();
const use = require('../helper/utility').use;
const cors = require('cors');

api.get('/api/events', auth.verify('user'), use(eventManagementController.get));

api.get('/api/public-events', cors(), use(eventManagementController.getPublicEvents));

api.get('/api/events/matching', auth.verify('user'), use(eventManagementController.getMatchingEvents));

api.get('/api/events/dashboard', auth.verify('user'), use(eventManagementController.dashboard));

api.post('/api/events/register', auth.verify('owner'), use(registeredParticipantController.create));

api.get('/api/events/:id', auth.verify('user'), use(eventManagementController.getById));

api.post('/api/event/payment/:id', auth.verify('user'), use(registeredParticipantController.pay));

api.post('/api/sepa-attach', auth.verify('user'), use(registeredParticipantController.sepa.attach));

api.post('/api/event/success', auth.verify('user'), use(registeredParticipantController.successPayment));

module.exports = api;
