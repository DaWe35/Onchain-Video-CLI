import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { TEMP_DIR, checkExistingUpload } = require('../utils/uploadManager');
const fs = require('fs').promises;
const path = require('path');


const existingUpload = await checkExistingUpload();
let filename, lastUploadedChunk, totalChunks, videoId, videoFile;

if (existingUpload) {
  ({ filename, lastUploadedChunk, totalChunks, videoId } = existingUpload);

    const chunkNumber = 90;
    const chunkPath = path.join(TEMP_DIR, filename + '_chunk_' + chunkNumber);
    const chunkData = await fs.readFile(chunkPath);

    console.log(chunkData.toString('hex'));
} else {
    console.log('No existing upload found');
}
