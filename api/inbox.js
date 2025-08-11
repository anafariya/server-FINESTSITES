const express = require('express');
const auth = require('../model/auth');
const chatController = require('../controller/chatController');
const api = express.Router();
const use = require('../helper/utility').use;
const multer = require('multer');
const upload = multer({ dest: 'uploads' });

api.get('/api/inbox', auth.verify('user'), use(chatController.getInboxLists));
api.get('/api/inbox/unread', auth.verify('user'), use(chatController.getCountUnreadMessages));
api.put('/api/inbox/block/:chatId', auth.verify('user'), use(chatController.blockUser));
api.get('/api/inbox/:chatId', auth.verify('user'), use(chatController.getMessages));
api.get('/api/inbox/user/:chatId', auth.verify('user'), use(chatController.getChatUserProfile));
api.post('/api/inbox/:chatId', auth.verify('user'), upload.any(), use(chatController.sendMessage));
api.put('/api/inbox/read/:chatId', auth.verify('user'), upload.any(), use(chatController.readMessages));

module.exports = api;
