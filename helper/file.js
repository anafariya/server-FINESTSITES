const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const i18n = require('i18n');

exports.rename = function({ file, folder, name }){

  // generate a random UUID if no name is provided
  let n = name || uuidv4();

  // etract the file extension from the provided name or MIME type
  let extension = path.extname(n) || `.${file.mimetype.split('/')[1]}`;

  // remove the extension from the name if it exists
  n = path.basename(n, path.extname(n));

  // add folder path if specified
  if (folder) n = `${folder}/${n}`;

  // Append the extension
  file.originalname = `${n}${extension}`;
  return;

}

exports.resize = async function({ file, w, h }){

  // resize the file and return a file buffer
  return await sharp(file.path)
  .resize(w, h || w, { fit: sharp.fit.cover })
  .toFormat(file.mimetype.split('/')[1])
  .toBuffer();

}

exports.assert = {}

exports.assert.type = function({ file, type, locale }){

  locale && i18n.setLocale(locale);

  const mimes = type.map(x => {
    return x === 'jpg' ? 'image/jpeg' : `image/${x}`

  })

  if (!mimes.includes(file.mimetype))
    throw { message: i18n.__('helper.file.invalid_type', { type: file.mimetype.split('/')[1] }) }

  return true;
    
}

exports.line = {};

// remove a line from a file after str
exports.line.remove = async function({ path, str, locale }){

  locale && i18n.setLocale(locale);

  let file = await fs.readFile(path, 'utf8');
  file = file.split('\n');

  const index = file.findIndex(x => x.includes(str));
  if (index < 0) throw { message: i18n.__('helper.file.string_not_found', { str: str, path: path }) }

  file.splice(index, 1);
  file = file.join('\n');
  return await fs.writeFile(path, file, 'utf8');

}

// insert lines in file after a str index
// lines is an array of objects with find/insert keys
// insert value will be inserted one line after the find value
exports.line.insert = async function({ path, lines, locale }){

  locale && i18n.setLocale(locale);

  let file = await fs.readFile(path, 'utf8')
  file = file.split('\n');

  lines.forEach(line => {

    const index = file.findIndex(x => x.includes(line.find));
    if (index < 0) throw { message: i18n.__('helper.file.string_not_found', { str: line.find, path: path }) }
    file.splice(index+1, 0, line.insert);

  });

  file = file.join('\n');
  return await fs.writeFile(path, file, 'utf8');

}

// replace a str in a file
exports.replace = async function({ path, find, replace }){

  let file = await fs.readFile(path, 'utf8');
  file = file.replace(find, replace);
  await fs.writeFile(path, file, 'utf8');

} 

// delete a file if it exists
exports.delete = async function(path){

  try {

    await fs.access(path);
    fs.unlink(path);
  
  }
  catch (err){

    // do nothing
    
  }
}