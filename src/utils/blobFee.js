const { createPublicClient, http, formatGwei } = require('viem')
const { mainnet } = require('viem/chains')

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http('https://rpc.flashbots.net')
})

async function getBlobFee() {
  try {
    const blobGasPriceWei = await publicClient.request({
      method: 'eth_blobBaseFee',
      params: []
    })
    
    const blobGasPriceGwei = formatGwei(blobGasPriceWei)
    return blobGasPriceGwei
  } catch (error) {
    console.error('Failed to fetch blob gas price:', error)
    throw error
  }
}

async function getEthereumFee() {
  try {
    const gasPriceWei = await publicClient.getGasPrice()
    return formatGwei(gasPriceWei)
  } catch (error) {
    console.error('Failed to fetch Ethereum gas price:', error)
    throw error
  }
}

module.exports = {
  getBlobFee,
  getEthereumFee
}
