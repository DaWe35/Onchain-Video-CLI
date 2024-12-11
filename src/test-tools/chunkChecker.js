import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { TEMP_DIR, checkExistingUpload } = require('../utils/uploadManager');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const { createPublicClient, http } = require('viem');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const contractAddress = '0x1F00F51E00F10c019617fB4A50d4E893aaf8C98c';

const contractABI = [
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_chunkId",
				"type": "uint256"
			}
		],
		"name": "getChunk",
		"outputs": [
			{
				"internalType": "bytes",
				"name": "",
				"type": "bytes"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
  {
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_videoId",
				"type": "uint256"
			}
		],
		"name": "getVideo",
		"outputs": [
			{
				"internalType": "string",
				"name": "filename",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "duration",
				"type": "uint256"
			},
			{
				"internalType": "string",
				"name": "metadata",
				"type": "string"
			},
			{
				"internalType": "uint256[]",
				"name": "chunkIds",
				"type": "uint256[]"
			},
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

// Create a custom chain configuration for Blast
const blastMainnet = {
  id: 81457,
  name: 'Blast',
  network: 'blast',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://rpc.blast.io'] },
    public: { http: ['https://rpc.blast.io'] },
  }
}

const blastSepolia = {
  id: 168587773,
  name: 'Blast Sepolia',
  network: 'blast-sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://sepolia.blast.io'] },
    public: { http: ['https://sepolia.blast.io'] },
  }
}

let publicClient;
const NETWORK = 'mainnet'
if (NETWORK === 'mainnet') {
  publicClient = createPublicClient({
    chain: blastMainnet,
    transport: http('https://rpc.blast.io')
  });
} else {
  publicClient = createPublicClient({
    chain: blastSepolia,
    transport: http('https://sepolia.blast.io')
  });
}

async function compareChunks(videoId, localChunks, chunkIds, filename) {
  console.log(`\nComparing chunks for video ${videoId}...`);
  console.log(`Local chunks: ${localChunks}, Onchain chunks: ${chunkIds.length}`);
  const mismatches = [];

  for (let i = 0; i < chunkIds.length; i++) {
    try {
      const localChunkNum = i;
      const chunkId = chunkIds[i];
      const chunkPath = path.join(TEMP_DIR, `${filename}_chunk_${localChunkNum}`);
      const localChunk = await fs.readFile(chunkPath);
      const localHex = '0x' + localChunk.toString('hex');
      
      console.log(`Checking chunk ${localChunkNum} (Chain ID: ${chunkId})...`);
      const chainChunk = await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getChunk',
        args: [chunkId]
      });
      
      if (localHex !== chainChunk) {
        mismatches.push({
          localChunk: localChunkNum,
          chainChunkId: chunkId,
          local: localHex,
          chain: chainChunk
        });
        console.log(`❌ Mismatch found in chunk ${localChunkNum} (Chain ID: ${chunkId})`);
        console.log(`   Local (first 10): ${localHex.substring(0, 12)}`);
        console.log(`   Chain (first 10): ${chainChunk.substring(0, 12)}`);
      } else {
        console.log(`✅ Chunk ${localChunkNum} matches (Chain ID: ${chunkId})`);
        console.log(`   Local (first 10): ${localHex.substring(0, 12)}`);
        console.log(`   Chain (first 10): ${chainChunk.substring(0, 12)}`);
      }
    } catch (error) {
      console.error(`Error comparing chunk ${i}:`, error.message);
      mismatches.push({ chunk: i, chainChunkId: chunkIds[i], error: error.message });
    }
  }

  return mismatches;
}

async function main() {
  const existingUpload = await checkExistingUpload()
  let filename, totalChunks, videoId

  if (existingUpload) {
    ({ filename, totalChunks } = existingUpload)

    rl.question('Enter the video ID to check: ', async (inputVideoId) => {
      videoId = parseInt(inputVideoId, 10)
      
      if (isNaN(videoId) || videoId < 0) {
        console.log('Invalid video ID. Please enter a valid number.')
        rl.close()
        return
      }

      console.log(`Checking video ${videoId} at ${contractAddress}...`)
      try {
        // First check if we can connect to the blockchain
        const chainId = await publicClient.getChainId()
        console.log(`Connected to chain ID: ${chainId}`)

        // Get video info from blockchain
        console.log('Fetching video data...')
        try {
          const video = await publicClient.readContract({
            address: contractAddress,
            abi: contractABI,
            functionName: 'getVideo',
            args: [BigInt(videoId)]
          })

          console.log('Raw response:', video)

          if (!video) {
            console.log(`No data returned for video ID ${videoId}`)
            rl.close()
            return
          }

          // Destructure the array response
          const [filename, duration, metadata, chunkIds, owner] = video

          // Check if video exists
          if (!chunkIds || chunkIds.length === 0) {
            console.log(`Video ID ${videoId} does not exist or has no chunks on the blockchain`)
            rl.close()
            return
          }

          console.log('\nVideo found on blockchain:')
          console.log(`Filename: ${filename}`)
          console.log(`Duration: ${duration}`)
          console.log(`Metadata: ${metadata}`)
          console.log(`Number of chunks: ${chunkIds.length}`)
          console.log(`Owner: ${owner}`)
          
          const mismatches = await compareChunks(videoId, totalChunks, chunkIds, filename)
          
          if (mismatches.length === 0) {
            console.log('\n✅ All chunks match perfectly!')
          } else {
            console.log('\n❌ Found mismatches in the following chunks:')
            mismatches.forEach(mismatch => {
              if (mismatch.error) {
                console.log(`Local chunk ${mismatch.chunk} (Chain ID: ${mismatch.chainChunkId}): Error - ${mismatch.error}`)
              } else {
                console.log(`Local chunk ${mismatch.localChunk} (Chain ID: ${mismatch.chainChunkId}):`)
                console.log(`  Local (first 10): ${mismatch.local.substring(0, 12)}`)
                console.log(`  Chain (first 10): ${mismatch.chain.substring(0, 12)}`)
              }
            })
          }
        } catch (contractError) {
          console.error('Contract call error:', {
            message: contractError.message,
            cause: contractError.cause,
            details: contractError.details
          })
        }
      } catch (error) {
        console.error('Connection error:', error)
      }
      
      rl.close()
    })
  } else {
    console.log('No existing upload found')
    rl.close()
  }
}

main()
