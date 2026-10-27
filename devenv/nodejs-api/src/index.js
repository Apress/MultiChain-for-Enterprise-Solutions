const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const awardRoutes = require('./routes/awards');
const redemptionRoutes = require('./routes/redemptions');
const correctionRoutes = require('./routes/corrections');

const app = express();

app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', region: process.env.REGION });
});

app.use('/auth', authRoutes);
app.use('/awards', awardRoutes);
app.use('/redemptions', redemptionRoutes);
app.use('/corrections', correctionRoutes);

// Central error handler - business rule violations (422), auth
// failures (401/403), and unexpected errors (500) all land here.
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  if (statusCode === 500) console.error(err);
  res.status(statusCode).json({ error: err.message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Meridian Rewards API listening on port ${PORT} (region: ${process.env.REGION})`);
});

module.exports = app;
