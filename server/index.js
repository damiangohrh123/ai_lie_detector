import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

app.post("/analyze-voice", upload.array("audioFiles"), async (req, res) => {
  if (!req.files.length) return res.status(400).json({ error: "No files" });

  const wavBuffers = [];

  for (const file of req.files) {
    try {
      const wav = await convertWebmToWav(file.buffer);
      wavBuffers.push(wav.toString("base64"));
    } catch (e) {
      console.warn("Conversion failed:", e.message);
    }
  }

  if (!wavBuffers.length) return res.status(400).json({ error: "No valid segments" });

  try {
    const pyRes = await fetch(`${process.env.PYTHON_API_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wav_buffers: wavBuffers }),
    });

    if (!pyRes.ok) {
      const errText = await pyRes.text();
      throw new Error(`FastAPI error: ${errText}`);
    }

    const json = await pyRes.json();
    res.json(json);
  } catch (err) {
    console.error("Failed to contact FastAPI:", err.message);
    res.status(500).json({ error: "FastAPI server error", detail: err.message });
  }
});

function convertWebmToWav(inputBuffer) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-f", "webm",
      "-i", "pipe:0",
      "-ar", "16000",
      "-ac", "1",
      "-f", "wav",
      "pipe:1"
    ]);

    const chunks = [];
    let err = "";

    ff.stdout.on("data", c => chunks.push(c));
    ff.stderr.on("data", d => err += d);
    ff.on("close", code => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg ${code}: ${err}`));
      }
    });

    ff.stdin.write(inputBuffer);
    ff.stdin.end();
  });
}

app.listen(5000, () => console.log("Listening on 5000"));
