const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// define schema
const CitySchema = new Schema({
  name: { type: String, unique: true, required: true }

}, { timestamps: true });

const City = mongoose.model('City', CitySchema, 'city');
exports.schema = City;

/*
* city.get()
* get an city by email or id
*/

exports.get = async function ({ search = '', group = '' }) {
  const query = {};

  if (search) {
    query.name = { $regex: search, $options: 'i' };
  }

  let cities = await City.find(query).sort({ updatedAt: -1 });

  return cities;
};