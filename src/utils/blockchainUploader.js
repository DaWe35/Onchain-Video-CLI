const fs = require('fs').promises;
const path = require('path');
const { createPublicClient, createWalletClient, http, formatGwei, parseGwei } = require('viem');
const { blast } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const { calculateGasPrice } = require('./gasEstimator');
const { PROGRESS_FILE, updateProgress } = require('./uploadManager');
const { getBlobFee, getEthereumFee } = require('./blobFee');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Initialize Viem clients
let publicClient;
let walletClient;
if (process.env.NETWORK === 'mainnet') {
  publicClient = createPublicClient({
    chain: blast,
    transport: http('https://rpc.ankr.com/blast')
  });
} else {
  publicClient = createPublicClient({
    chain: blast,
    transport: http('https://sepolia.blast.io')
  });
}

const abiPath = path.join(__dirname, '..', '..', 'src', 'abi.json');
let contractABI;

// Modified ABI loading function
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
  await loadABI();

  // Initialize the account and wallet client
  const account = privateKeyToAccount(privateKey);
  walletClient = createWalletClient({
    account,
    chain: blast,
    transport: http(process.env.NETWORK === 'mainnet' ? 'https://rpc.ankr.com/blast' : 'https://sepolia.blast.io')
  });

  let videoId;

  if (startFromChunk === null) {
    // Create the video if starting from the beginning
    console.log('Creating video on the blockchain...');
    videoId = await createOnchainVideo(videoMetadata, gasProfile, customMaxGas);
    await updateProgress(0, videoChunks.length, videoMetadata.filename, videoId);
    startFromChunk = 0;
  } else {
    // If resuming, retrieve the videoId
    console.log('Resuming upload...');
    videoId = await retrieveVideoId(videoMetadata.filename);
  }

  // Upload chunks
  for (let i = startFromChunk; i < videoChunks.length; i++) {
    const chunk = videoChunks[i];

    try {
      const adjustedGasLimit = 29700000n;

      while ((ethereumFee = await getEthereumFee()) > Number(process.env.L1_FEE_LIMIT_GWEI)) {
        console.log('L1 fee is higher (', ethereumFee, ') than the limit set in .env, waiting 10 minutes... ');
        await sleep(600000);
      }

      while ((blobFee = await getBlobFee()) > Number(process.env.L1_BLOBL_FEE_LIMIT_GWEI)) {
        console.log('Blob gas price is higher (', blobFee, ') than the limit set in .env, waiting 10 minutes... ');
        await sleep(600000);
      }

      let gasPrice = await calculateGasPrice();

      switch (gasProfile) {
        case 'fast':
          await uploadChunk(videoId, chunk, adjustedGasLimit, gasPrice, i, videoChunks.length, videoMetadata.filename);
          await new Promise(resolve => setTimeout(resolve, 5000));
          break;
        case 'onePerMinute':
          await uploadChunk(videoId, chunk, adjustedGasLimit, gasPrice, i, videoChunks.length, videoMetadata.filename);
          await new Promise(resolve => setTimeout(resolve, 60000));
          break;
        case 'custom':
          while (gasPrice > parseGwei(`${customMaxGas}`)) {
            console.log(`Current gas price (${formatGwei(gasPrice)} Gwei) is higher than custom max (${customMaxGas} Gwei). Waiting 1 minute before checking again.`);
            await new Promise(resolve => setTimeout(resolve, 60000));
            gasPrice = await calculateGasPrice();
          }
          await uploadChunk(videoId, chunk, adjustedGasLimit, gasPrice, i, videoChunks.length, videoMetadata.filename);
          await new Promise(resolve => setTimeout(resolve, 10000));
          break;
      }
    } catch (error) {
      console.error(`Error uploading chunk ${i + 1}:`, error);
      throw error;
    }
  }

  console.log('All chunks uploaded successfully');
}

async function createOnchainVideo(videoMetadata, gasProfile, customMaxGas) {
  const { filename, duration, metadata } = videoMetadata;
  
  let gasPrice = await calculateGasPrice();
  if (gasProfile === 'custom') {
    while (gasPrice > parseGwei(`${customMaxGas}`)) {
      console.log(`Current gas price (${formatGwei(gasPrice)} Gwei) is higher than custom max (${customMaxGas} Gwei). Waiting 1 minute before checking again.`);
      await new Promise(resolve => setTimeout(resolve, 60000));
      gasPrice = await calculateGasPrice();
    }
  }

  try {
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'createOnchainVideo',
      args: [filename, duration, metadata],
      gas: gasLimit,
      gasPrice: gasPrice
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Video created on blockchain. Transaction hash: ${receipt.transactionHash}`);
    console.log(`Gas used: ${receipt.gasUsed}, Gas price: ${formatGwei(gasPrice)} Gwei`);

    const logs = await publicClient.getLogs({
      address: contractAddress,
      event: {
        type: 'event',
        name: 'VideoCreated',
        inputs: [
          {
            type: 'uint256',
            name: 'videoId',
            indexed: true
          }
        ]
      },
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber
    });

    if (logs[0]) {
      return logs[0].args.videoId;
    } else {
      throw new Error('VideoCreated event not found in transaction receipt');
    }
  } catch (error) {
    console.error('Error creating video on blockchain:', error);
    throw error;
  }
}

async function uploadChunk(videoId, chunk, gasLimit, gasPrice, currentChunkNumber, totalChunks, videoFilename) {
  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: contractABI,
    functionName: 'uploadChunk',
    args: [chunk, videoId],
    gas: gasLimit,
    gasPrice: gasPrice
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Chunk ${currentChunkNumber + 1}/${totalChunks} uploaded. Tx hash: ${receipt.transactionHash}. Gas used: ${receipt.gasUsed}, Gas price: ${formatGwei(gasPrice)} Gwei`);
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
