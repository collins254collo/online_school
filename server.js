require('dotenv').config();

const express = require('express');
const cors    = require('cors');
// const routes  = require('./src/routes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security & parsing
// app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Routes 
// app.use('/api', routes);

// ── Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── 404 handler 
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

// ── Global error handler 
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Campus Voting API running on http://localhost:${PORT}`);
});

module.exports = app;