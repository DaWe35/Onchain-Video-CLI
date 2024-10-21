require('dotenv').config();
const { getPrivateKey } = require('./utils/keyManager');
const { getVideoFile, getResolution, convertAndChunkVideo } = require('./utils/videoProcessor');
const { getEthPrice, selectGasProfile, confirmUpload } = require('./utils/gasEstimator');
const { uploadVideoToBlockchain } = require('./utils/blockchainUploader');
const path = require('path');

async function main() {
  try {
    console.log('Starting video upload process...');
    
    const privateKey = await getPrivateKey();
   //  console.debug('Private key retrieved.');
    
    const videoFile = await getVideoFile();
   //  console.debug('Video file selected:', videoFile);
    
    const resolution = await getResolution();
   //  console.debug('Resolution selected:', resolution);
    
   //  console.debug('Converting and chunking video...');
    const videoChunks = await convertAndChunkVideo(videoFile, resolution);
   //  console.debug('Video converted and chunked. Total chunks:', videoChunks.length);
    
   //  console.debug('Fetching ETH price...');
    const ethPrice = await getEthPrice();
   //  console.debug('Current ETH price:', ethPrice);
    
   //  console.debug('Selecting gas profile...');
    const { gasProfile, customMaxGas, estimatedGasCosts } = await selectGasProfile(videoChunks.length, ethPrice);
   //  console.debug('Gas profile selected:', gasProfile);
    
    const confirmed = await confirmUpload(estimatedGasCosts, gasProfile, customMaxGas);

    if (confirmed) {
      console.log('Starting blockchain upload...');
      const videoMetadata = {
        filename: path.basename(videoFile),
        duration: 0, // You'll need to implement a way to get the actual duration
        metadata: JSON.stringify({
          codec: "video/mp4; codecs=\"avc1.64002A, mp4a.40.5\""
        })
      };
      await uploadVideoToBlockchain(privateKey, videoChunks, gasProfile, customMaxGas, videoMetadata);
      console.log('Video uploaded successfully!');
    } else {
      console.log('Upload cancelled.');
    }
  } catch (error) {
    console.error('An error occurred:');
    console.error(error.stack);
  }
}

main();
