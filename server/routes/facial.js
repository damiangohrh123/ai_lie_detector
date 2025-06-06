import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Workaround for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.post('/analyze-face', (req, res) => {
  const videoData = req.body.videoBase64;

  if (!videoData) {
    return res.status(400).json({ error: 'Missing video data' });
  }

  // Decode base64 video and save temporarily
  const videoBuffer = Buffer.from(videoData, 'base64');
  const videoPath = path.join(__dirname, '../temp_face_video.mp4');

  fs.writeFileSync(videoPath, videoBuffer);

  // Spawn Python process to run facial_model.py
  const pythonProcess = spawn('venv\\Scripts\\python.exe', ['facial_model.py', videoPath], {
    cwd: path.join(__dirname, '..')
  });

  let output = '';
  pythonProcess.stdout.on('data', (data) => {
    output += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error('Python Error:', data.toString());
  });

  pythonProcess.on('close', (code) => {
    // Delete temp video after processing
    fs.unlinkSync(videoPath);

    try {
      const parsed = JSON.parse(output);
      res.json({ emotionResults: parsed });
    } catch (err) {
      console.error('Failed to parse Python output:', output);
      res.status(500).json({ error: 'Failed to analyze facial expressions' });
    }
  });
});

export default router;
