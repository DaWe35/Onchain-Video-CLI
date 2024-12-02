const { createPublicClient, http, formatGwei, parseGwei, formatEther } = require('viem')
const { blast } = require('viem/chains')
const readline = require('readline')

const publicClient = createPublicClient({
    chain: blast,
    transport: http('https://rpc.ankr.com/blast')
})

// Set GAS_PER_CHUNK to the specified value
const GAS_PER_CHUNK = 29164658n

// Calculate gas price based on the current base fee
async function calculateFee() {
    try {
        const block = await publicClient.getBlock()
        const baseFee = block.baseFeePerGas
        const increasedFee = baseFee + (baseFee * 4n) / 100n
        return increasedFee
    } catch (error) {
        console.error('Error fetching current base fee:')
        console.error(error.stack)
        return null
    }
}

async function getEthPrice() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
        const data = await response.json()
        return parseFloat(data.ethereum.usd)
    } catch (error) {
        console.error('Error fetching ETH price:')
        console.error(error.stack)
        return null
    }
}

// Add new function to calculate L1 data fee
async function calculateL1DataFee() {
    try {
        // Create a 40KB hex string (40 * 1024 = 40960 bytes = 81920 hex characters)
        // Each byte is represented by 2 hex characters
        const sampleData = '0x' + 'ff'.repeat(41 * 1024)

        const l1Gas = await publicClient.readContract({
            address: '0x420000000000000000000000000000000000000F', // dummy address
			functionName: 'getL1Fee',
            args: [sampleData],
			abi: [{
					inputs: [{
						internalType: "bytes",
						name: "_data",
						type: "bytes"
					}],
					name: "getL1Fee",
					outputs: [{
						internalType: "uint256",
						name: "",
						type: "uint256"
					}],
					stateMutability: "view",
					type: "function"
				}]
        })

		return l1Gas
    } catch (error) {
        console.error('Error calculating L1 data fee:')
        console.error(error.stack)
        return null
    }
}

function calculateUsd(totalGas, ethPrice) {
    // Add L1 data fee to the total gas cost
    const ethCost = Number(totalGas) / 1e18 // Convert from wei to ETH
    const usdCost = ethCost * ethPrice
    return { 
        eth: ethCost.toFixed(6), 
        usd: usdCost.toFixed(2),
    }
}

// Update estimateGasCosts function
async function estimateGasCosts(chunkCount, customGasPrice = null) {
    try {
		const ethPrice = await getEthPrice();

        const gasPrice = customGasPrice ? parseGwei(`${customGasPrice}`) : await calculateFee()
        const gasPerChunk = GAS_PER_CHUNK * gasPrice
        
        // Get L1 data fee
        const l1FeePerChunk = await calculateL1DataFee()

        let fastGas = 0n
        let onePerMinuteGas = 0n
        let customGas = 0n
		let totalL1Fee = 0n

        for (let i = 0; i < chunkCount; i++) {
            fastGas += BigInt(Math.floor(Number(gasPerChunk) * Math.pow(1.02, i)))
            onePerMinuteGas += BigInt(Math.floor(Number(gasPerChunk) * Math.pow(1.01, i)))
            customGas += gasPerChunk
			totalL1Fee += l1FeePerChunk
        }
		
        return {
            fast: calculateUsd(fastGas, ethPrice),
            onePerMinute: calculateUsd(onePerMinuteGas, ethPrice),
            custom: customGasPrice ? calculateUsd(customGas, ethPrice) : null,
			l1: calculateUsd(totalL1Fee, ethPrice)
        }
    } catch (error) {
        console.error('Error estimating gas costs:')
        console.error(error.stack)
        throw error
    }
}

// Update selectGasProfile function to display L1 fees
async function selectGasProfile(chunkCount) {
    const estimatedGasCosts = await estimateGasCosts(chunkCount)
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    try {
        console.log(`\nSelect a gas profile for uploading ${chunkCount} chunks (estimates can be inaccurate):`)
        console.log(`1. Instant: ${estimatedGasCosts.fast.eth} + ${estimatedGasCosts.l1.eth} ETH ($${estimatedGasCosts.fast.usd}) L2 fee + ${estimatedGasCosts.l1.eth} ETH ($${estimatedGasCosts.l1.usd}) L1 fee`)
        console.log(`2. One chunk per minute: ${estimatedGasCosts.onePerMinute.eth} ETH ($${estimatedGasCosts.onePerMinute.usd}) L2 fee + ${estimatedGasCosts.l1.eth} ETH ($${estimatedGasCosts.l1.usd}) L1 fee`)
        console.log('3. Limit gas price: Uploads when gas price is below your specified limit. This can be really slow.\n')

        const answer = await new Promise((resolve) => {
            rl.question('Enter your choice (1-3): ', resolve)
        })

        let gasProfile, customMaxGas

        switch (answer) {
            case '1':
                gasProfile = 'fast'
                break
            case '2':
                gasProfile = 'onePerMinute'
                break
            case '3':
                gasProfile = 'custom'
                rl.close()
                customMaxGas = await promptMaxGasPrice()
                const customEstimate = await estimateGasCosts(chunkCount, customMaxGas)
                estimatedGasCosts.custom = customEstimate.custom
                console.log(`Custom (${customMaxGas} Gwei): ${estimatedGasCosts.custom.eth} ETH ($${estimatedGasCosts.custom.usd})`)
                break
            default:
                console.log('Invalid choice. Defaulting to Fast profile.')
                gasProfile = 'fast'
        }

        rl.close()

        return { gasProfile, customMaxGas, estimatedGasCosts }
    } catch (error) {
        console.error('Error selecting gas profile:')
        console.error(error.stack)
        throw error
    }
}

async function confirmUpload(estimatedGasCosts, gasProfile, customMaxGas) {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    })

    return new Promise((resolve) => {
        console.log('\nSelected profile:')
        if (gasProfile === 'custom') {
            console.log(`Custom (${customMaxGas} Gwei): ${estimatedGasCosts.custom.eth} ETH ($${estimatedGasCosts.custom.usd})`)
        } else {
            console.log(`${gasProfile.charAt(0).toUpperCase() + gasProfile.slice(1)}: ${estimatedGasCosts[gasProfile].eth} ETH ($${estimatedGasCosts[gasProfile].usd})`)
        }
        
        readline.question(`\nProceed with upload? (y/n): `, (answer) => {
            readline.close()
            resolve(answer.toLowerCase() === 'y')
        })
    })
}

async function promptMaxGasPrice() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    try {
        // Get current gas price
        const gasPrice = await calculateFee()
        const currentGasPriceGwei = formatGwei(gasPrice)
        
        console.log(`Current gas price: ${currentGasPriceGwei} Gwei`)
        
        const maxGasPrice = await new Promise((resolve) => {
            rl.question('Enter max gas price (in Gwei): ', (answer) => {
                resolve(parseFloat(answer))
            })
        })
        return maxGasPrice
    } catch (error) {
        console.error('Error prompting for max gas price:')
        console.error(error.stack)
        throw error
    } finally {
        rl.close()
    }
}

module.exports = {
    estimateGasCosts,
    getEthPrice,
    selectGasProfile,
    confirmUpload,
    calculateFee
}