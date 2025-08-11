const express = require('express');
const auth = require('../model/auth');
const eventController = require('../controller/eventController');
const api = express.Router();
const use = require('../helper/utility').use;

api.post('/api/event', auth.verify('public'), use(eventController.create));

module.exports = api;
