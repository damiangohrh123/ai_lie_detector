import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

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

  const py = spawn("python", [path.join(__dirname, "voice_analysis.py")]);
  let out = "", err = "";

  py.stdout.on("data", d => out += d);
  py.stderr.on("data", d => err += d);

  py.on("close", code => {
    if (code !== 0) return res.status(500).json({ error: err || "Python error" });

    try {
      return res.json(JSON.parse(out));
    } catch {
      return res.status(500).json({ error: "Invalid JSON from Python", raw: out });
    }
  });

  py.stdin.write(JSON.stringify({ wav_buffers: wavBuffers }));
  py.stdin.end();
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
