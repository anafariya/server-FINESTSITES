const express = require('express');
const config = require('config');
const auth = require('../model/auth');
const limiter = require('express-rate-limit');
const aiController = require('../controller/aiController');
const throttle = config.get('throttle');
const api = express.Router();
const use = require('../helper/utility').use;

/* ai */
api.post('/api/ai/text', limiter(throttle.api), auth.verify('user'), use(aiController.text));

api.post('/api/ai/image', limiter(throttle.api), auth.verify('user'), use(aiController.image));

module.exports = api;
