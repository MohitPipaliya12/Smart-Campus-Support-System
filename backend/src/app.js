const path = require('path');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');

const apiRoutes = require('./routes/index');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandlers');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.use('/api', apiRoutes);

// Serve AngularJS frontend (no separate dev server needed)
const frontendRoot = path.join(__dirname, '../../frontend');
app.use(express.static(frontendRoot));

// SPA fallback (AngularJS uses hash routes, but this helps refresh/bookmark)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendRoot, 'index.html'));
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

