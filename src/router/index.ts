import { router } from '../config/express.js';
import { authRouts } from '../module/auth/auth.routes.js';
import { userRoutes } from '../module/user/user.routes.js';
import { userContactRoutes } from '../module/userContact/userContact.routes.js';

export const mainrouter = router;
const moduleRoutes = [
  { path: '/auth', route: authRouts },
  { path: '/users', route: userRoutes },
  { path: '/contacts', route: userContactRoutes },
];

moduleRoutes.forEach((route) => mainrouter.use(route.path, route.route));

