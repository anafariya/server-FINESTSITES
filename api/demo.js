/* demo purposes only - delete me */
const express = require('express');
const auth = require('../model/auth');
const demoController = require('../controller/demoController');
const api = express.Router();
const use = require('../helper/utility').use;

api.get('/api/demo', auth.verify('user'),use(demoController.get));

module.exports = api;
