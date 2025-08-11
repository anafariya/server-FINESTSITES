const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { pathToFileURL } = require('url'); 

const ignore = ['.DS_Store', 'index.js', 'spec.yaml'];

async function loadRoutes() {

  const files = await fs.readdir(path.join(__dirname));

  for (const file of files){
    if (!ignore.includes(file)){

      const filePath = path.join(__dirname, file);
      const fileURL = pathToFileURL(filePath).href;
      
      const mod = await import(fileURL);
      if (mod.default) router.use(mod.default);

    }
  }
}

(async () => {
  await loadRoutes();
})();

module.exports = router;
