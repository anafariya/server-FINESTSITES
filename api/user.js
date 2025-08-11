const express = require('express');
const multer = require('multer');
const config = require('config');
const auth = require('../model/auth');
const limiter = require('express-rate-limit');
const userController = require('../controller/userController');
const throttle = config.get('throttle');
const api = express.Router();
const use = require('../helper/utility').use;
const upload = multer({ dest: 'uploads' });

/* user */
api.post('/api/user', limiter(throttle.signup), use(userController.create));

api.get('/api/user', auth.verify('user', 'user.read', 'unverified'), use(userController.get));

api.get('/api/user/account', auth.verify('user'), use(userController.account));

api.get('/api/user/permissions', auth.verify('user', 'user.read'), use(userController.permissions));

api.get('/api/user/:id', auth.verify('admin', 'user.read'), use(userController.get));

api.get('/api/user/profile/:id', auth.verify('user', 'user.read'), use(userController.getProfileOtherUser));

api.patch('/api/user', auth.verify('user', 'user.update'), upload.any(), use(userController.update));

api.patch('/api/user/onboarding-1', auth.verify('user', 'user.update'), upload.any(), use(userController.updateOnboardingProfile));

api.patch('/api/user/onboarding-2', auth.verify('user', 'user.update'), upload.any(), use(userController.updateProfilePhoto));

api.patch('/api/user/photos', auth.verify('user', 'user.update'), upload.any(), use(userController.updateUserPhotos));

api.patch('/api/user/avatar', auth.verify('user', 'user.update'), upload.any(), use(userController.updateAvatar));

api.put('/api/user/password', auth.verify('user'), use(userController.password));

api.post('/api/user/verify', auth.verify('public'), use(userController.verify));

api.post('/api/user/verify/request', limiter(throttle.signup), auth.verify('user', false, 'unverified'), use(userController.verify.request));

api.put('/api/user/2fa', auth.verify('user'), use(userController['2fa']));

api.post('/api/user/2fa/verify', auth.verify('user'), use(userController['2fa'].verify));

api.delete('/api/user', auth.verify('user', 'user.delete'), use(userController.delete));

api.delete('/api/user/:id', auth.verify('user', 'user.delete', 'unverified'), use(userController.delete));

module.exports = api;
