require('dotenv').config();
const {
  PORT: port = 3000,
  SUPABASE_URL,
  SUPABASE_KEY,
  COOKIE_SECRET,
} = process.env;

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const corsOptions = {
  origin: '*',
  optionsSuccessStatus: 200,
};

const { userRoutes } = require('./app/routes/userRoute');
const { spaceRoutes } = require('./app/routes/spacesRoute');
const { taskRoutes } = require('./app/routes/taskRoute');
const { matterPortRoutes } = require('./app/routes/matterPortRoute');
const { menuRoutes } = require('./app/routes/menuRoute');
const { documentRoutes } = require('./app/routes/documentRoute');
const { listRoutes } = require('./app/routes/listRoute');
const { notificationRoutes } = require('./app/routes/notificationsRoute');
const { floorsRoutes } = require('./app/routes/floorsRoutes');
const { assetRoutes } = require('./app/routes/assetsRoute');
const { eventRoutes } = require('./app/routes/eventsRoute');
const { spaceMembershipRoutes } = require('./app/routes/spaceMembershipsRoute');

const connectToServer = () => {
  app.use(cors(corsOptions));
  app.use(bodyParser.json({ limit: '100mb' }));
  app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
  app.use(cookieParser(COOKIE_SECRET));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  userRoutes(app, supabase);
  spaceRoutes(app, supabase);
  taskRoutes(app, supabase);
  matterPortRoutes(app, supabase);
  menuRoutes(app, supabase);
  documentRoutes(app, supabase);
  listRoutes(app, supabase);
  notificationRoutes(app, supabase);
  floorsRoutes(app, supabase);
  assetRoutes(app, supabase);
  eventRoutes(app, supabase);
  spaceMembershipRoutes(app, supabase);

  app.listen(port, () => {
    console.log(`Server is listening at http://localhost:${port}`);
  });
};

connectToServer();
