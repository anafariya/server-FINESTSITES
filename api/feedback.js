const express = require('express');
const auth = require('../model/auth');
const feedbackController = require('../controller/feedbackController');
const api = express.Router();
const use = require('../helper/utility').use;

api.post('/api/feedback', auth.verify('user'), use(feedbackController.create));

module.exports = api;
