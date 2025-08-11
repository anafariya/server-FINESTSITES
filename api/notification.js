const express = require('express');
const auth = require('../model/auth');
const notificationController = require('../controller/notificationController');
const api = express.Router();
const use = require('../helper/utility').use;

api.get('/api/notification', auth.verify('user', 'user.read'), use(notificationController.get));

api.patch('/api/notification', auth.verify('user', 'user.update'), use(notificationController.update));

module.exports = api;
