const mongoose = require('mongoose');

exports.connect = async (settings) => {

  try {

    const url = `mongodb+srv://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}/${process.env.DB_NAME}`;
    await mongoose.connect(url);
    console.log('✅ Connected to Mongo');

  }
  catch (err){

    console.error(err);

  }
}