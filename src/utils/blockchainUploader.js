const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
require('dotenv').config();
const { getEthPrice } = require('./gasEstimator');

let web3;
if (process.env.NETWORK === 'mainnet') {
  web3 = new Web3('https://rpc.blast.io');
} else {
  web3 = new Web3('https://sepolia.blast.io	');
}

const abiPath = path.join(__dirname, '..', '..', 'src', 'abi.json');
const contractABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
let contractAddress;
if (process.env.NETWORK === 'mainnet') {
  contractAddress = '0x1F00F51E00F10c019617fB4A50d4E893aaf8C98c';
} else {
  contractAddress = '0xe9b1324F531A4603eb5D1a739E4Ee25a5C824890';
}

async function uploadVideoToBlockchain(privateKey, videoChunks, gasProfile, customMaxGas, videoMetadata) {
  // Initialize the signer
  const signer = web3.eth.accounts.privateKeyToAccount(privateKey);
  web3.eth.accounts.wallet.add(signer);
  web3.eth.defaultAccount = signer.address;

  const contract = new web3.eth.Contract(contractABI, contractAddress);

  // First, create the video
  console.log('Creating video on the blockchain...');
  const videoId = await createOnchainVideo(contract, signer, videoMetadata, gasProfile, customMaxGas);

  // Then, upload the chunks
  for (let i = 0; i < videoChunks.length; i++) {
    const chunk = videoChunks[i];
    console.log(`Preparing to upload chunk ${i + 1} of ${videoChunks.length}`);

    try {
      const adjustedGasLimit = 29700000; // Add some buffer

      let gasPrice = await web3.eth.getGasPrice();

      switch (gasProfile) {
        case 'fast':
          await uploadChunk(contract, videoId, chunk, signer, adjustedGasLimit, gasPrice);
          await new Promise(resolve => setTimeout(resolve, 4000)); // Wait 4 seconds
          break;
        case 'onePerMinute':
          await uploadChunk(contract, videoId, chunk, signer, adjustedGasLimit, gasPrice);
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
          break;
        case 'custom':
          while (BigInt(gasPrice) > BigInt(web3.utils.toWei(customMaxGas.toString(), 'gwei'))) {
            console.log(`Current gas price (${web3.utils.fromWei(gasPrice, 'gwei')} Gwei) is higher than custom max (${customMaxGas} Gwei). Waiting 1 minute before checking again.`);
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
            gasPrice = await web3.eth.getGasPrice();
          }
          await uploadChunk(contract, videoId, chunk, signer, adjustedGasLimit, gasPrice);
          break;
      }

      console.log(`Chunk ${i + 1} uploaded successfully.`);
    } catch (error) {
      console.error(`Error uploading chunk ${i + 1}:`, error);
      throw error;
    }
  }

  console.log('All chunks uploaded successfully');
}

async function createOnchainVideo(contract, signer, videoMetadata, gasProfile, customMaxGas) {
  const { filename, duration, metadata } = videoMetadata;
  
  let gasPrice = await web3.eth.getGasPrice();
  if (gasProfile === 'custom') {
    while (BigInt(gasPrice) > BigInt(web3.utils.toWei(customMaxGas.toString(), 'gwei'))) {
      console.log(`Current gas price (${web3.utils.fromWei(gasPrice, 'gwei')} Gwei) is higher than custom max (${customMaxGas} Gwei). Waiting 1 minute before checking again.`);
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
      gasPrice = await web3.eth.getGasPrice();
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
    console.log(`Gas used: ${receipt.gasUsed}, Gas price: ${web3.utils.fromWei(gasPrice, 'gwei')} Gwei`);
    
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

async function uploadChunk(contract, videoId, chunk, signer, gasLimit, gasPrice) {
  const receipt = await contract.methods.uploadChunk(chunk, videoId).send({
    from: signer.address,
    gas: gasLimit,
    gasPrice: gasPrice
  });
  console.log(`Chunk uploaded. Transaction hash: ${receipt.transactionHash}`);
  console.log(`Gas used: ${receipt.gasUsed}, Gas price: ${web3.utils.fromWei(gasPrice, 'gwei')} Gwei`);
}

module.exports = { uploadVideoToBlockchain };