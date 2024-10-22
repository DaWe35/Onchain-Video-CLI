const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const TEMP_DIR = path.join(__dirname, '..', '..', 'temp-chunks');
const PROGRESS_FILE = path.join(TEMP_DIR, 'upload_progress.json');

async function checkExistingUpload() {
  try {
    const progressData = await fs.readFile(PROGRESS_FILE, 'utf8');
    return JSON.parse(progressData);
  } catch (error) {
    return null;
  }
}

async function confirmResumeUpload(existingUpload) {
  const { filename, lastUploadedChunk, totalChunks } = existingUpload;
  console.log(`Found an incomplete upload for ${filename}`);
  console.log(`Progress: ${lastUploadedChunk + 1}/${totalChunks} chunks uploaded`);

  const latestChunkPath = path.join(TEMP_DIR, `${filename}_chunk_${lastUploadedChunk}`);
  const latestChunkData = await fs.readFile(latestChunkPath);
  const latestChunkHex = latestChunkData.toString('hex').slice(0, 30);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askQuestion = (question) => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.toLowerCase());
      });
    });
  };

  try {
    const resumeAnswer = await askQuestion('Do you want to resume this upload? (y/n): ');
    if (resumeAnswer !== 'y') {
      return false;
    }

    console.log(`Latest uploaded chunk data starts with: ${latestChunkHex}`);
    const matchAnswer = await askQuestion('Does this match the latest chunk uploaded on the blockchain? (y/n): ');
    
    if (matchAnswer === 'y') {
      return true;
    } else {
      console.log("If the latest chunk does not match, it's an indication of the wrong chunk being uploaded. This can make the video unplayable. This usually happens when the upload is completed, but not (yet) confirmed on the blockchain. Please edit the upload_progress.json file to correct the lastUploadedChunk value. Make sure you have no pending transactions in your wallet.");
      console.log(`File location: ${PROGRESS_FILE}`);
      process.exit(1);
    }
  } finally {
    rl.close();
  }
}

async function updateProgress(lastUploadedChunk, totalChunks, filename, videoId) {
  const progressData = {
    lastUploadedChunk,
    totalChunks,
    filename,
    videoId
  };
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
}

async function cleanupTempFiles() {
  try {
    await fs.unlink(PROGRESS_FILE);
    const files = await fs.readdir(TEMP_DIR);
    for (const file of files) {
      await fs.unlink(path.join(TEMP_DIR, file));
    }
    console.log('Temporary files cleaned up.');
  } catch (error) {
    console.error('Error cleaning up temporary files:', error);
  }
}

module.exports = {
  TEMP_DIR,
  PROGRESS_FILE,
  checkExistingUpload,
  confirmResumeUpload,
  updateProgress,
  cleanupTempFiles
};
