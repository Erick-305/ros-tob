import 'dotenv/config';
import { app } from './app.js';
import { ensureDefaultUser } from './bootstrap/ensure-default-user.js';
import { port } from './config/env.js';

ensureDefaultUser()
  .then(() => app.listen(port, () => console.log(`ROS-TOB API listening on http://localhost:${port}`)))
  .catch((error) => { console.error('Unable to initialize ROS-TOB API', error); process.exitCode = 1; });
