const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.text = async function({ prompt }){

  const res = await openai.chat.completions.create({

    model: 'gpt-4-turbo',
    messages: [{ role: 'user', content: prompt }]

  });

  return res?.choices?.[0].message?.content?.replace(/^\n+/, '');

}

exports.image = async function({ prompt, size, number }){

  const res = await openai.images.generate({

    prompt: prompt,
    size: size || '512x512',
    n: number || 1,

  });

  return res?.data;

}