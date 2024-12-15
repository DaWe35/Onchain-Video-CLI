const fs = require('fs').promises
const path = require('path')

const ERROR_LOG_FILE = path.join(__dirname, '..', '..', 'error.log')

// Ensure logs directory exists
async function ensureLogDirectory() {
    const logDir = path.dirname(ERROR_LOG_FILE)
    try {
        await fs.access(logDir)
    } catch {
        await fs.mkdir(logDir, { recursive: true })
    }
}

async function logError(error) {
    await ensureLogDirectory()
    
    const timestamp = new Date().toISOString()
    const errorMessage = `${timestamp} - ${error.message}\n`
    
    try {
        await fs.appendFile(ERROR_LOG_FILE, errorMessage)
    } catch (logError) {
        console.error('Failed to write to error log:', logError)
    }
}

module.exports = { logError } 