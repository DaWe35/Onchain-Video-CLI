require('dotenv').config();
const { getPrivateKey } = require('./utils/keyManager');
const { getVideoFile, getResolution, convertAndChunkVideo, saveChunks, loadChunks } = require('./utils/videoProcessor');
const { selectGasProfile, confirmUpload } = require('./utils/gasEstimator');
const { uploadVideoToBlockchain } = require('./utils/blockchainUploader');
const { TEMP_DIR, checkExistingUpload, confirmResumeUpload, cleanupTempFiles } = require('./utils/uploadManager');
const path = require('path');

async function main() {
  try {
    console.log('Starting video upload process...');
    
    await getPrivateKey();
    // console.debug('Private key retrieved.');
    
    // Check for existing upload
    const existingUpload = await checkExistingUpload();
    let filename, lastUploadedChunk, totalChunks, videoId, videoFile, videoChunks;

    if (existingUpload && await confirmResumeUpload(existingUpload)) {
      ({ filename, lastUploadedChunk, totalChunks, videoId } = existingUpload);
      videoChunks = await loadChunks(TEMP_DIR, path.basename(filename));
      console.log(`Resuming upload for ${filename} from chunk ${lastUploadedChunk + 1}`);
    } else {
      videoFile = await getVideoFile();
      // console.debug('Video file selected:', videoFile);
      
      const resolution = await getResolution();
      // console.debug('Resolution selected:', resolution);
      
      // console.debug('Converting and chunking video...');
      videoChunks = await convertAndChunkVideo(videoFile, resolution);
      await saveChunks(TEMP_DIR, path.basename(videoFile), videoChunks);
      lastUploadedChunk = null;
      videoId = null;
      filename = path.basename(videoFile);
      totalChunks = videoChunks.length;
    }
    
    // console.debug('Video converted and chunked. Total chunks:', totalChunks);
    console.log(`Total chunks: ${totalChunks}`);
    
    // console.debug('Selecting gas profile...');
    const { gasProfile, customMaxGas, estimatedGasCosts } = await selectGasProfile(totalChunks - lastUploadedChunk - 1);
    // console.debug('Gas profile selected:', gasProfile);
    
    const confirmed = await confirmUpload(estimatedGasCosts, gasProfile, customMaxGas);

    if (confirmed) {
      console.log('Starting blockchain upload...');
      const videoMetadata = {
        filename: filename,
        duration: 0, // todo
        metadata: JSON.stringify({
          codec: "video/mp4; codecs=\"avc1.64002A, mp4a.40.5\""
        })
      };
      let startFromChunk = null;
      if (lastUploadedChunk !== null) {
        startFromChunk = lastUploadedChunk + 1;
      }
      await uploadVideoToBlockchain(videoChunks, gasProfile, customMaxGas, videoMetadata, startFromChunk);
      console.log('Video uploaded successfully!');
      await cleanupTempFiles();
    } else {
      console.log('Upload cancelled.');
    }
  } catch (error) {
    console.error('An error occurred in main():');
    console.error(error.message);
    // log error to file
    const errorLogFile = path.join(__dirname, 'error.log');
    const errorLog = fs.createWriteStream(errorLogFile, { flags: 'a' });
    errorLog.write(`${new Date().toISOString()} - ${error}\n`);
    errorLog.end();
  }
}

main();
