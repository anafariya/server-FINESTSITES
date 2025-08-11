const express = require('express');
const auth = require('../model/auth');
const pushtokenController = require('../controller/pushtokenController');
const api = express.Router();
const use = require('../helper/utility').use;

/* push_token */
api.put('/api/pushtoken/', auth.verify('user'), use(pushtokenController.create));

module.exports = api;
