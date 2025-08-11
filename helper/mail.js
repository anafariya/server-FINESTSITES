const config = require('config');
const domain = config.get('domain');
const settings = config.get('email');
const file = require('fs').promises;
const escape = require('lodash.escape');
const email = require('../model/email');
const utility = require('../helper/utility');
const nodemailer = require('nodemailer')
const mailgun = require('nodemailer-mailgun-transport');
const i18n = require('i18n');

/*
* mail.send()
* send an email using mailgun
* data: to (email address), content (values to inject), custom (optional: custom html template)
*/

exports.send = async function(data){

	if (process.env.TESTING)
		return false;

	data.locale && i18n.setLocale(data.locale);

	console.log(data, 'data');
	

	// validate email address
	const rex = /^(?:[a-z0-9!#$%&amp;'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&amp;'*+/=?^_`{|}~-]+)*|'(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*')@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/

	if (rex.test(data.to.toLowerCase())){

		const transport = nodemailer.createTransport(mailgun({
			host: settings.host,
			auth: {
				api_key: process.env.MAILGUN_API_KEY,
				domain: settings.domain,
			}
		}))

		// console.log(transport, process.env.MAILGUN_API_KEY, settings, 'trans');
		

		// get content from db
		const content = data.custom ? data.content : await email.get({ name: data.template, locale: data.locale });
		console.log(content, data.custom, 'check template');
		utility.assert(content, i18n.__('helper.mail.invalid_template'));

		const html = await createEmail({ template: data.html_template || 'template', content: content || data.content, values: data.content }); // create html template

		try {
		const datas = await transport.sendMail({

			from: settings.sender,
			to: [data.to],
			subject: content?.subject || data?.subject,
			html: html

		});
		console.log(datas, 'sent');
		
	} catch (error) {
		console.log(error); //logs any error
	  }
		
		console.log(i18n.__('helper.mail.sent', { email: data.to }));

	}
	else {

		throw ({ message: i18n.__('helper.mail.invalid_email') });

	}
}

/*
* createEmail()
* opens html email template and injects content into the {}
* template: name of the html file located in /emails (default: template.html)
* content: object containing body and button
* inject: values to inject to content
*/

async function createEmail({ template, content, values }){

	// get the template
	let email = await file.readFile(`emails/${template}.html`, 'utf8');
	email = email.replace(/{{domain}}/g, values?.domain || domain);

	// generate dynamic email
	if (content){

		// split content into lines
		content.body = content.body.split('\n');

		// set default title and preheader if not specified
		content.title = content.title || content.subject;
		content.preheader = content.preheader || content.body[0]; 

		// inject domain?
		if (content.button_url?.includes('{{domain}}'))
			content.button_url = content.button_url.replace(/{{domain}}/g, values?.domain || domain)

		if (values?.name && content.name !== 'contact')
			content.body.unshift(`Hi ${escape(values.name)},`)
		
		content.body.forEach((line, i) => {

			content.body[i] = 
			`<p style="font-family: 'Source Sans Pro', helvetica, sans-serif; font-size: 15px; font-weight: normal; Margin: 0; Margin-bottom: 15px; line-height: 1.6;">${line}</p>`

		});

		content.body = content.body.join('\n');

		email = email.replace(/{{title}}/g, content.title);
		email = email.replace('{{preheader}}', content.preheader);
		email = email.replace('{{body}}', content.body);
		email = email.replace('{{button.url}}', content.button_url);
		email = email.replace('{{button.label}}', content.button_label);

		// inject content into {{braces}}
		if (values){
			for (key in values){
				
				const rex = new RegExp(`{{content.${key}}}`, 'g');
				email = email.replace(rex, values[key]);
				
			}
		}
	}

	return email;

}
