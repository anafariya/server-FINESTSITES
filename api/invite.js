const express = require('express');
const auth = require('../model/auth');
const inviteController = require('../controller/inviteController');
const api = express.Router();
const use = require('../helper/utility').use;

/* invites */
api.post('/api/invite', auth.verify('admin', 'invite.create'), use(inviteController.create));

api.get('/api/invite', auth.verify('admin', 'invite.read'), use(inviteController.get));

api.get('/api/invite/:id', auth.verify('admin', 'invite.read'), use(inviteController.get));

api.delete('/api/invite/:id', auth.verify('admin', 'invite.delete'), use(inviteController.delete));

module.exports = api;
