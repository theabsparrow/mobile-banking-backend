import { router } from "../config/express.js";
import { authRouts } from "../module/auth/auth.routes.js";

export const mainrouter = router
const moduleRoutes = [
  { path: "/auth", route: authRouts }
];

moduleRoutes.forEach((route) => mainrouter.use(route.path, route.route))