import { router } from '../config/express.js';
import { authRouts } from '../module/auth/auth.routes.js';
import { userRoutes } from '../module/user/user.routes.js';
import { userContactRoutes } from '../module/userContact/userContact.routes.js';
import { transactionRoutes } from '../module/transaction/transaction.routes.js';
import { requestRoutes } from '../module/request/request.routes.js';

export const mainrouter = router;
const moduleRoutes = [
  { path: '/auth', route: authRouts },
  { path: '/users', route: userRoutes },
  { path: '/contacts', route: userContactRoutes },
  { path: '/transactions', route: transactionRoutes },
  { path: '/requests', route: requestRoutes },
];

moduleRoutes.forEach((route) => mainrouter.use(route.path, route.route));

