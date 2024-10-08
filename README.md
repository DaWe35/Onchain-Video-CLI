# Onchain Video CLI

This script allows you to upload videos to the Blast blockchain.

## Important Disclaimer

This is a beta software and it can make you spend a lot of money on gas fees. Use it at your own risk.

Also please generate a separate wallet for this, it's very dangerous to store your private key on your local machine without encryption. If you just want a demo, try the web version: https://onchainvideo.win

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file in the root directory with your Ethereum private key:
   ```
   ETHEREUM_PRIVATE_KEY=your_private_key_here
   NETWORK=mainnet or testnet
   ```

3. Ensure you have `ffmpeg` installed on your system for video conversion.

4. Place the contract ABI in a file named `abi.json` in the root directory.

## Usage

Run the script using:

```
npm install
npm start
```

> Btw FFmpeg wasm is awesome, I promise I'll use it in a real project. I missed you guys so much
