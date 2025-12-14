

const path = require('path');
const { spawn } = require('child_process');
const PYTHON_SCRIPT = path.join(
  __dirname,
  '../ml/sentiment_analysis/sentiment_analysis.py'
);

function analyzeSentiment(text) {
    return new Promise((resolve, reject) => {
        const process = spawn('python', [PYTHON_SCRIPT, text]);
        let rawData = '';

        process.stdout.on('data', (data) => {
            rawData += data;
        });

        process.stdout.on('end', () => {
            try {
                const sentiment = JSON.parse(rawData.toString().trim());
                resolve(sentiment);
            } catch (error) {
                reject(new Error("Failed to parse sentiment result: " + error.message));
            }
        });

        process.stderr.on('data', (data) => {
            const errorMessage = data.toString().trim();
            if (errorMessage.includes("Device set to use cpu")) {
                // Ignore this specific error message
                return;
            }
            console.error("stderr received from Python script:", errorMessage); // Log stderr data
            reject(new Error("Error from Python script: " + errorMessage));
        });
    });
}

module.exports = analyzeSentiment;

