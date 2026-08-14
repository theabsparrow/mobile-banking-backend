import { router } from '../config/express.js';
import { authRouts } from '../module/auth/auth.routes.js';
import { userRoutes } from '../module/user/user.routes.js';

export const mainrouter = router;
const moduleRoutes = [
  { path: '/auth', route: authRouts },
  { path: '/users', route: userRoutes },
];

moduleRoutes.forEach((route) => mainrouter.use(route.path, route.route));
