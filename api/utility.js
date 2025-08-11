const express = require('express');
const multer = require('multer');
const auth = require('../model/auth');
const utilityController = require('../controller/utilityController');
const upload = multer({ dest: 'uploads' });
const api = express.Router();
const use = require('../helper/utility').use;

api.post('/api/utility/upload', auth.verify('user'), upload.any(), use(utilityController.upload));

api.post('/api/utility/mail', use(utilityController.mail));

module.exports = api;
