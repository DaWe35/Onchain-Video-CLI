const fs = require('fs').promises;
const { exec } = require('child_process');
const readline = require('readline');
const path = require('path');

async function getVideoFile() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter the path to the video file (or drag and drop it here): ', (answer) => {
      rl.close();
      // Sanitize the input by trimming whitespace and removing quotes
      const sanitizedAnswer = answer.trim().replace(/^["']|["']$/g, '');
      resolve(sanitizedAnswer);
    });
  });
}

async function getResolution() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter the height for the video (e.g., 90, 144, 240, 360, 480, 720, 1080): ', (answer) => {
      const height = parseInt(answer);
      if (isNaN(height) || height <= 0 || height >= 2160) {
        console.log('Invalid input. Please enter a number between 1 and 2160.');
        rl.close();
        resolve(getResolution()); // Recursively call the function for a valid input
      } else {
        rl.close();
        resolve(height);
      }
    });
  });
}

async function convertAndChunkVideo(videoFile, resolution) {
  console.log('Starting video conversion and chunking...');
  const tempFile = 'temp_converted.mp4';
    
  const ffmpegCommand = `ffmpeg -i '${videoFile}' -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:v libx264 -profile:v main -level:v 4.2  -vf "scale=-2:${resolution}" -c:a aac -b:a 128k -shortest -movflags frag_keyframe+empty_moov+default_base_moof -f mp4 "${tempFile}"`;
  
  console.log('FFmpeg command:', ffmpegCommand);
  
  return new Promise((resolve, reject) => {
    const ffmpegProcess = exec(ffmpegCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('FFmpeg error:', error);
        reject(error);
        return;
      }
     //  console.debug('Video conversion completed.');
      
      fs.readFile(tempFile)
        .then(data => {
         //  console.debug('Converted video file read successfully.');
          const chunkSize = 40 * 1024; // 40KB chunks
          const chunks = [];
          for (let i = 0; i < data.length; i += chunkSize) {
            chunks.push(data.slice(i, i + chunkSize));
          }
          console.log(`Video chunked into ${chunks.length} parts.`);
          return chunks;
        })
        .then(chunks => {
          return fs.unlink(tempFile).then(() => {
           //  console.debug('Temporary file deleted.');
            return chunks;
          });
        })
        .then(resolve)
        .catch(err => {
          console.error('Error processing video:', err);
          reject(err);
        });
    });

    ffmpegProcess.stdout.on('data', (data) => {
      console.log(`FFmpeg stdout: ${data}`);
    });

    ffmpegProcess.stderr.on('data', (data) => {
      console.error(`FFmpeg stderr: ${data}`);
    });
  });
}

async function saveChunks(tempDir, filename, chunks) {
  await fs.mkdir(tempDir, { recursive: true });
  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = path.join(tempDir, `${filename}_chunk_${i}`);
    await fs.writeFile(chunkPath, chunks[i]);
  }
}

async function loadChunks(tempDir, filename) {
  const files = await fs.readdir(tempDir);
  const chunkFiles = files.filter(file => file.startsWith(`${filename}_chunk_`));
  chunkFiles.sort((a, b) => {
    const aIndex = parseInt(a.split('_').pop());
    const bIndex = parseInt(b.split('_').pop());
    return aIndex - bIndex;
  });

  const chunks = [];
  for (const chunkFile of chunkFiles) {
    const chunkPath = path.join(tempDir, chunkFile);
    const chunkData = await fs.readFile(chunkPath);
    chunks.push(chunkData);
  }
  return chunks;
}

module.exports = { getVideoFile, getResolution, convertAndChunkVideo, saveChunks, loadChunks };
