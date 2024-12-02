const fs = require('fs').promises
const readline = require('readline')
const { isHex, getAddress } = require('viem')
const { privateKeyToAccount } = require('viem/accounts')

async function getPrivateKey() {
  // First check for private key in environment variable
  if (process.env.PRIVATE_KEY) {
    try {
      validatePrivateKey(process.env.PRIVATE_KEY)
      return process.env.PRIVATE_KEY
    } catch (error) {
      console.error('Invalid private key in environment variable:', error.message)
    }
  }

  // If not in env, prompt user
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  while (true) {
    try {
      const privateKey = await new Promise((resolve) => {
        rl.question('Private key is not defined in .env, please enter your private key. For security reasons, we strongly recommend using a separate wallet for this project: ', resolve)
      })

      validatePrivateKey(privateKey)
      rl.close()
      return privateKey
    } catch (error) {
      console.error('Invalid private key:', error.message)
    }
  }
}

function validatePrivateKey(privateKey) {
  // Remove '0x' prefix if present
  const cleanKey = privateKey.replace('0x', '')

  // Check if it's a valid hex string of correct length
  if (!isHex(`0x${cleanKey}`) || cleanKey.length !== 64) {
    throw new Error('Private key must be a 64-character hex string')
  }

  try {
    // Try to derive an account from the private key
    const account = privateKeyToAccount(`0x${cleanKey}`)
    // Validate the derived address
    getAddress(account.address)
  } catch (error) {
    throw new Error('Invalid private key format')
  }
}

module.exports = { getPrivateKey }