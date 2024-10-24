async function getBlobGasPrice() {
    const rpcUrl = 'https://rpc.flashbots.net'; // mainnet RPC URL
    
    try {
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_blobBaseFee',
                params: [],
                id: 1
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(`RPC error: ${data.error.message}`);
        }

        // Convert hex string to decimal
        const blobGasPriceHex = data.result;
        const blobGasPriceWei = BigInt(blobGasPriceHex);
        
        return {
            hex: blobGasPriceHex,
            wei: blobGasPriceWei.toString(),
            gwei: Number(blobGasPriceWei) / 1e9
        };
    } catch (error) {
        console.error('Failed to fetch blob gas price:', error);
        throw error;
    }
}
