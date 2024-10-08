const readline = require('readline');

async function getPrivateKey() {
  const privateKey = process.env.PRIVATE_KEY;
  
  if (privateKey) {
    return privateKey;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Private key is not defined in .env, please enter your private key. For security reasons, we strongly recommend using a separate wallet for this project: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

module.exports = { getPrivateKey };