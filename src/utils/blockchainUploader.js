const fs = require('fs').promises;
const path = require('path');
const Web3 = require('web3');
const { calculateGasPrice } = require('./gasEstimator');
const { PROGRESS_FILE, updateProgress } = require('./uploadManager');
const { getBlobFee, getEthereumFee } = require('./blobFee');

let web3;
if (process.env.NETWORK === 'mainnet') {
  // web3 = new Web3('https://rpc.blast.io');
  web3 = new Web3('https://rpc.ankr.com/blast');
} else {
  web3 = new Web3('https://sepolia.blast.io	');
}

const abiPath = path.join(__dirname, '..', '..', 'src', 'abi.json');
let contractABI;

// We'll load the ABI asynchronously
async function loadABI() {
  try {
    const abiData = await fs.readFile(abiPath, 'utf8');
    contractABI = JSON.parse(abiData);
  } catch (error) {
    console.error('Error loading ABI:', error);
    throw error;
  }
}

let contractAddress;
if (process.env.NETWORK === 'mainnet') {
  contractAddress = '0x1F00F51E00F10c019617fB4A50d4E893aaf8C98c';
} else {
  contractAddress = '0xe9b1324F531A4603eb5D1a739E4Ee25a5C824890';
}

async function uploadVideoToBlockchain(privateKey, videoChunks, gasProfile, customMaxGas, videoMetadata, startFromChunk) {
  await loadABI(); // Load the ABI before proceeding

  // Initialize the signer
  const signer = web3.eth.accounts.privateKeyToAccount(privateKey);
  web3.eth.accounts.wallet.add(signer);
  web3.eth.defaultAccount = signer.address;

  const contract = new web3.eth.Contract(contractABI, contractAddress);

  let videoId;

  if (startFromChunk === null) {
    // Create the video if starting from the beginning
    console.log('Creating video on the blockchain...');
    videoId = await createOnchainVideo(contract, signer, videoMetadata, gasProfile, customMaxGas);
    await updateProgress(0, videoChunks.length, videoMetadata.filename, videoId);
    startFromChunk = 0;
  } else {
    // If resuming, retrieve the videoId
    console.log('Resuming upload...');
    videoId = await retrieveVideoId(videoMetadata.filename);
  }

  // Then, upload the chunks
  for (let i = startFromChunk; i < videoChunks.length; i++) {
    const chunk = videoChunks[i];

    try {
      const adjustedGasLimit = 29700000; // Add some buffer

      while (ethereumFee = await getEthereumFee().gwei > Number(process.env.L1_FEE_LIMIT_GWEI)) {
        console.log('L1 fee is higher (', ethereumFee, ') than the limit set in .env, waiting 10 minutes... ');
        await sleep(600000);
      }

      while (blobFee = await getBlobFee().gwei > Number(process.env.L1_BLOBL_FEE_LIMIT_GWEI)) {
        console.log('Blob gas price is higher (', blobFee, ') than the limit set in .env, waiting 10 minutes... ');
        await sleep(600000);
      }

      let gasPrice = await calculateGasPrice();

      switch (gasProfile) {
        case 'fast':
          await uploadChunk(contract, videoId, chunk, signer, adjustedGasLimit, gasPrice, i, videoChunks.length, videoMetadata.filename);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          break;
        case 'onePerMinute':
          await uploadChunk(contract, videoId, chunk, signer, adjustedGasLimit, gasPrice, i, videoChunks.length, videoMetadata.filename);
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
          break;
        case 'custom':
          while (gasPrice > BigInt(web3.utils.toWei(customMaxGas.toString(), 'gwei'))) {
            console.log(`Current gas price (${web3.utils.fromWei(gasPrice.toString(), 'gwei')} Gwei) is higher than custom max (${customMaxGas} Gwei). Waiting 1 minute before checking again.`);
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
            gasPrice = await calculateGasPrice();
          }
          await uploadChunk(contract, videoId, chunk, signer, adjustedGasLimit, gasPrice, i, videoChunks.length, videoMetadata.filename);
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
          break;
      }

    } catch (error) {
      console.error(`Error uploading chunk ${i + 1}:`, error);
      throw error;
    }
  }

  console.log('All chunks uploaded successfully');
}

async function createOnchainVideo(contract, signer, videoMetadata, gasProfile, customMaxGas) {
  const { filename, duration, metadata } = videoMetadata;
  
  let gasPrice = await calculateGasPrice();
  if (gasProfile === 'custom') {
    while (gasPrice > BigInt(web3.utils.toWei(customMaxGas.toString(), 'gwei'))) {
      console.log(`Current gas price (${web3.utils.fromWei(gasPrice.toString(), 'gwei')} Gwei) is higher than custom max (${customMaxGas} Gwei). Waiting 1 minute before checking again.`);
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
      gasPrice = await calculateGasPrice();
    }
  }

  const gasLimit = 500000; // Adjust this value based on the actual gas requirement of CreateOnchainVideo

  try {
    const receipt = await contract.methods.createOnchainVideo(filename, duration, metadata).send({
      from: signer.address,
      gas: gasLimit,
      gasPrice: gasPrice
    });
    console.log(`Video created on blockchain. Transaction hash: ${receipt.transactionHash}`);
    console.log(`Gas used: ${receipt.gasUsed}, Gas price: ${web3.utils.fromWei(gasPrice.toString(), 'gwei')} Gwei`);
    
    // Assuming the contract emits an event with the videoId, we can get it from the logs
    const videoCreatedEvent = receipt.events.VideoCreated;
    if (videoCreatedEvent) {
      return videoCreatedEvent.returnValues.videoId;
    } else {
      throw new Error('VideoCreated event not found in transaction receipt');
    }
  } catch (error) {
    console.error('Error creating video on blockchain:', error);
    throw error;
  }
}

async function uploadChunk(contract, videoId, chunk, signer, gasLimit, gasPrice, currentChunkNumber, totalChunks, videoFilename ) {
  const receipt = await contract.methods.uploadChunk(chunk, videoId).send({
    from: signer.address,
    gas: gasLimit,
    gasPrice: gasPrice
  });
  console.log(`Chunk ${currentChunkNumber + 1}/${totalChunks} uploaded. Tx hash: ${receipt.transactionHash}. Gas used: ${receipt.gasUsed}, Gas price: ${web3.utils.fromWei(gasPrice.toString(), 'gwei')} Gwei`);
  await updateProgress(currentChunkNumber, totalChunks, videoFilename, videoId);
}

async function retrieveVideoId(filename) {
  try {
    const progressData = await fs.readFile(PROGRESS_FILE, 'utf8');
    const progress = JSON.parse(progressData);
    if (progress.filename === filename && progress.videoId) {
      return progress.videoId;
    } else {
      throw new Error('Video ID not found in progress file');
    }
  } catch (error) {
    console.error('Error retrieving video ID:', error);
    throw error;
  }
}

module.exports = { uploadVideoToBlockchain };
