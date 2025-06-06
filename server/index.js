import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(express.json());

app.post('/api/huggingface', async (req, res) => {
  const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;
  const { text } = req.body;

  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/gpt2',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: text }),
      }
    );

    const data = await response.json();
    res.json({ output: data[0]?.generated_text || 'No output' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error calling Hugging Face API' });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});