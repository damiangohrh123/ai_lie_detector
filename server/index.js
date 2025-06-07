import express from 'express';
import cors from 'cors';
import facialRoutes from './routes/facial.js';

const app = express();

app.use(cors()); // 👈 This enables CORS
app.use(express.json({ limit: '50mb' }));
app.use('/api', facialRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));