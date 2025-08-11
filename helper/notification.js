const { Expo } = require('expo-server-sdk');
const pushtoken = require('../model/pushtoken');
const expo = new Expo();
const i18n = require('i18n');

async function send({ tokens, message, locale }){

  locale && i18n.setLocale(locale);

  let messages = [], tickets = [];
  if (typeof tokens === 'string') tokens = [tokens]; // format single token

  if (tokens && tokens.length){
    for (let token of tokens) {

      token = 'ExponentPushToken[' + token + ']';

      // check token is valid
      if (!Expo.isExpoPushToken(token)){

        console.log(i18n.__('helper.notification.invalid_token', { token: token }));
        continue;

      }

      // construct the message
      messages.push({

        to: token,
        title: message.title,
        body: message.body,
        sound: message.sound ? message.sound : 'default',
        data: message.data ? { withSome: message.data } : {},

      });
    }

    // send the notifications
    tickets = await expo.sendPushNotificationsAsync(messages);
    tickets.forEach((ticket, index) => ticket.token = tokens[index]);
    getReceipts({ tickets, locale });

  }
  else {

    console.warn(i18n.__('helper.notification.no_tokens'));
    return false;

  }
}

async function getReceipts({ tickets, locale }){

  let receiptIds = [], receipts = [];

  // get the receipt ids
  for (let ticket of tickets){
    switch (ticket.status){

      case 'ok':
      receiptIds.push(ticket.id);
      break;

      case 'error':
      console.log(ticket.details.error);
      break;

    }
  }

  const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);

  for (let chunk of receiptIdChunks){

    // receipts specify whether Apple/Google successfully received the
    // notification and information about an error, if one occurred.
    let receipts = await expo.getPushNotificationReceiptsAsync(chunk);
    if (typeof receipts === 'object') receipts = [receipts];

    for (let receipt of receipts){

      Object.keys(receipt).map(key => {

        key = receipt[key];

        if (key.status === 'error' && key.details && key.details.error) {

          console.log(i18n.__('helper.notification.error', { message: key.message }));
          console.log(i18n.__('helper.notification.error_code', { code: key.details.error }));

          switch (key.details.error){

            case 'DeviceNotRegistered':
            const ticket = tickets.find(x => x.id === key);
            pushtoken.delete({ token: ticket.token });
            break;

          }
        }
      });
    }
  }
}

exports.send = send;