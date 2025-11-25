import express from 'express';
import logger from '#config/logger.js';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();

// Use (OpenSource)Helmet to enhance API's security
app.use(helmet());
// Enable CORS for all routes
// In production, you might want to restrict origins here
app.use(cors());
// Parse JSON bodies (as sent by API clients)
app.use(express.json());
// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: true }));
// Parse Cookie header and populate req.cookies
app.use(cookieParser());

// Use morgan to log HTTP requests
app.use(
  morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } })
);

app.get('/', (req, res) => {
  logger.info('Hello from acquisitions!');
  res.status(200).send('Hello from acquisitions!');
});

export default app;
