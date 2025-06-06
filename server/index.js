import express from 'express';
import facialRoutes from './routes/facial.js';

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use('/api', facialRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
