import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Necessary to replace __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
const upload = multer({ dest: 'uploads/' });

app.post('/analyze-audio', upload.single('audio'), (req, res) => {
  const filePath = req.file.path;

  exec(`python voice_analysis.py ${filePath}`, (error, stdout, stderr) => {
    fs.unlinkSync(filePath);

    if (error) {
      console.error('Python error:', stderr); // Make sure this line exists
      return res.status(500).send('Error processing audio');
    }

    res.send(stdout);
  });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
