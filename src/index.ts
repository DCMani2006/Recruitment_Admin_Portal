import cors from 'cors';
import express, { Request, Response } from 'express';
import adminRoutes from './routes/adminRoutes';
import { getJwtSecret } from './middleware/authMiddleware';

const app = express();
app.set('trust proxy', 1); // behind one proxy on hosts like Render

// Only the admin frontend(s) listed in CORS_ORIGIN (comma separated) may call this backend from a browser.
const allowedOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (allowedOrigins.length === 0) {
  console.warn('WARNING: CORS_ORIGIN is not set, so any website can call this backend. Set it to the admin frontend address.');
}
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));
app.use(express.json({ limit: '100kb' }));

if (!getJwtSecret()) {
  console.warn('WARNING: JWT_SECRET is not set, so admins cannot log in. Set it (different from the student backend\'s).');
}

const PORT = process.env.PORT || 5000;
app.use('/api/admin', adminRoutes);

app.get('/', (req: Request, res: Response) => {
  res.send('Hello from the TAM-VIT Admin Portal Backend!');
});

export { app };

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}
