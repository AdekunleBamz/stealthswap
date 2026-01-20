import express from 'express';
import cors from 'cors';
import { htlcRouter } from './routes/htlc.js';
import { swapRouter } from './routes/swap.js';
import { proofRouter } from './routes/proof.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'stealthswap-backend',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/htlc', htlcRouter);
app.use('/api/swap', swapRouter);
app.use('/api/proof', proofRouter);

app.listen(PORT, () => {
  console.log(`🔒 StealthSwap Backend running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
});

export default app;
