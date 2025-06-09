import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());

const upload = multer({ dest: 'uploads/' });

app.post('/analyze-audio', upload.single('audio'), (req, res) => {
  const filePath = req.file.path;

  exec(`python voice_analysis.py ${filePath}`, (error, stdout, stderr) => {
    fs.unlinkSync(filePath); // Clean up temp file

    if (error) {
      console.error('Python error:', stderr);
      return res.status(500).send('Error processing audio');
    }

    res.send(stdout.trim()); // Send emotion result
  });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});
