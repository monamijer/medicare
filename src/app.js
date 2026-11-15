const path = require('path');
const express = require('express');
const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');
const { createSessionMiddleware } = require('./config/session');
const flash = require('./middleware/flash');
const viewLocals = require('./middleware/viewLocals');
const { securityHeaders, sameOriginOnly } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(securityHeaders);

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(sameOriginOnly);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(createSessionMiddleware());
app.use(flash);
app.use(viewLocals);
app.use('/api/v1', apiRoutes);
app.use('/', webRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
