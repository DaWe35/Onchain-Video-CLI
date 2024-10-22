require('dotenv').config();
const { getPrivateKey } = require('./utils/keyManager');
const { getVideoFile, getResolution, convertAndChunkVideo, saveChunks, loadChunks } = require('./utils/videoProcessor');
const { getEthPrice, selectGasProfile, confirmUpload } = require('./utils/gasEstimator');
const { uploadVideoToBlockchain } = require('./utils/blockchainUploader');
const { TEMP_DIR, checkExistingUpload, confirmResumeUpload, cleanupTempFiles } = require('./utils/uploadManager');
const path = require('path');

async function main() {
  try {
    console.log('Starting video upload process...');
    
    const privateKey = await getPrivateKey();
    // console.debug('Private key retrieved.');
    
    // Check for existing upload
    const existingUpload = await checkExistingUpload();
    let filename, lastUploadedChunk, totalChunks, videoId, videoFile;

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
      lastUploadedChunk = -1;
      videoId = null;
      filename = path.basename(videoFile);
      totalChunks = videoChunks.length;
    }
    
    // console.debug('Video converted and chunked. Total chunks:', totalChunks);
    console.log(`Total chunks: ${totalChunks}`);
    
    // console.debug('Fetching ETH price...');
    const ethPrice = await getEthPrice();
    // console.debug('Current ETH price:', ethPrice);
    
    // console.debug('Selecting gas profile...');
    const { gasProfile, customMaxGas, estimatedGasCosts } = await selectGasProfile(totalChunks - lastUploadedChunk - 1, ethPrice);
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
      await uploadVideoToBlockchain(privateKey, videoChunks, gasProfile, customMaxGas, videoMetadata, lastUploadedChunk + 1);
      console.log('Video uploaded successfully!');
      await cleanupTempFiles();
    } else {
      console.log('Upload cancelled.');
    }
  } catch (error) {
    console.error('An error occurred:');
    console.error(error.stack);
  }
}

main();
