const path = require('path');
const express = require('express');
const webRoutes = require('./routes/web');
const viewLocals = require('./middleware/viewLocals');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(viewLocals);
app.use('/', webRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
