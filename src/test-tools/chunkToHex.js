import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { TEMP_DIR, checkExistingUpload } = require('../utils/uploadManager');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  const existingUpload = await checkExistingUpload();
  let filename, lastUploadedChunk, totalChunks, videoId, videoFile;

  if (existingUpload) {
    ({ filename, lastUploadedChunk, totalChunks, videoId } = existingUpload);

    rl.question('Enter the chunk number: ', async (chunkNumber) => {
      chunkNumber = parseInt(chunkNumber, 10);
      
      if (isNaN(chunkNumber) || chunkNumber < 1 || chunkNumber > totalChunks) {
        console.log(`Invalid chunk number. Please enter a number between 1 and ${totalChunks}.`);
        rl.close();
        return;
      }

      const chunkPath = path.join(TEMP_DIR, filename + '_chunk_' + chunkNumber);
      try {
        const chunkData = await fs.readFile(chunkPath);
        console.log(chunkData.toString('hex'));
      } catch (error) {
        console.error(`Error reading chunk ${chunkNumber}:`, error.message);
      }
      rl.close();
    });
  } else {
    console.log('No existing upload found');
    rl.close();
  }
}

main();
