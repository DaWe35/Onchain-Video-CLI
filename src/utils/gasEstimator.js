const Web3 = require('web3');
const readline = require('readline');

const web3 = new Web3('https://rpc.blast.io');

// Set GAS_PER_CHUNK to the specified value
const GAS_PER_CHUNK = 29164658;

async function getEthPrice() {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      const data = await response.json();
      return parseFloat(data.ethereum.usd);
    } catch (error) {
      console.error('Error fetching ETH price:');
      console.error(error.stack);
      return null;
    }
}

async function estimateGasCosts(chunkCount, ethPrice, customGasPrice = null) {
  try {
    const gasPrice = customGasPrice ? web3.utils.toWei(customGasPrice.toString(), 'gwei') : await web3.eth.getGasPrice();
    const gasPerChunk = BigInt(GAS_PER_CHUNK) * BigInt(gasPrice);

    const calculateCost = (totalGas) => {
      const ethCost = parseFloat(web3.utils.fromWei(totalGas.toString(), 'ether'));
      const usdCost = ethCost * ethPrice;
      return { 
        eth: ethCost.toFixed(6), 
        usd: usdCost.toFixed(2),
      };
    };

    let fastGas = BigInt(0);
    let onePerMinuteGas = BigInt(0);
    let customGas = BigInt(0);

    for (let i = 0; i < chunkCount; i++) {
      fastGas += BigInt(Math.floor(Number(gasPerChunk) * Math.pow(1.125, i)));
      onePerMinuteGas += BigInt(Math.floor(Number(gasPerChunk) * Math.pow(1.08, i)));
      customGas += gasPerChunk;
    }

    return {
      fast: calculateCost(fastGas),
      onePerMinute: calculateCost(onePerMinuteGas),
      custom: customGasPrice ? calculateCost(customGas) : null
    };
  } catch (error) {
    console.error('Error estimating gas costs:');
    console.error(error.stack);
    throw error;
  }
}

async function selectGasProfile(chunkCount, ethPrice) {
  const estimatedGasCosts = await estimateGasCosts(chunkCount, ethPrice);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    console.log(`\nSelect a gas profile for uploading ${chunkCount} chunks (estimates can be inaccurate):`);
    console.log(`1. Fast: ${estimatedGasCosts.fast.eth} ETH ($${estimatedGasCosts.fast.usd})`);
    console.log(`2. One per minute: ${estimatedGasCosts.onePerMinute.eth} ETH ($${estimatedGasCosts.onePerMinute.usd})`);
    console.log('3. Custom: To be calculated based on your input\n');

    const answer = await new Promise((resolve) => {
      rl.question('Enter your choice (1-3): ', resolve);
    });

    let gasProfile, customMaxGas;

    switch (answer) {
      case '1':
        gasProfile = 'fast';
        break;
      case '2':
        gasProfile = 'onePerMinute';
        break;
      case '3':
        gasProfile = 'custom';
        rl.close(); // Close the current readline interface
        customMaxGas = await promptMaxGasPrice();
        const customEstimate = await estimateGasCosts(chunkCount, ethPrice, customMaxGas);
        estimatedGasCosts.custom = customEstimate.custom;
        console.log(`Custom (${customMaxGas} Gwei): ${estimatedGasCosts.custom.eth} ETH ($${estimatedGasCosts.custom.usd})`);
        break;
      default:
        console.log('Invalid choice. Defaulting to Fast profile.');
        gasProfile = 'fast';
    }

    rl.close(); // Close the readline interface after processing the selection

    return { gasProfile, customMaxGas, estimatedGasCosts };
  } catch (error) {
    console.error('Error selecting gas profile:');
    console.error(error.stack);
    throw error;
  }
}

async function confirmUpload(estimatedGasCosts, gasProfile, customMaxGas) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\nSelected profile:');
    if (gasProfile === 'custom') {
      console.log(`Custom (${customMaxGas} Gwei): ${estimatedGasCosts.custom.eth} ETH ($${estimatedGasCosts.custom.usd})`);
    } else {
      console.log(`${gasProfile.charAt(0).toUpperCase() + gasProfile.slice(1)}: ${estimatedGasCosts[gasProfile].eth} ETH ($${estimatedGasCosts[gasProfile].usd})`);
    }
    
    readline.question(`\nProceed with upload? (y/n): `, (answer) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function promptMaxGasPrice() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Get current gas price
    const currentGasPrice = await web3.eth.getGasPrice();
    const currentGasPriceGwei = web3.utils.fromWei(currentGasPrice, 'gwei');
    
    console.log(`Current gas price: ${currentGasPriceGwei} Gwei`);
    
    const maxGasPrice = await new Promise((resolve) => {
      rl.question('Enter max gas price (in Gwei): ', (answer) => {
        resolve(parseFloat(answer));
      });
    });
    return maxGasPrice;
  } catch (error) {
    console.error('Error prompting for max gas price:');
    console.error(error.stack);
    throw error;
  } finally {
    rl.close();
  }
}

module.exports = {
  estimateGasCosts,
  getEthPrice,
  selectGasProfile,
  confirmUpload,
};