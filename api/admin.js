// Vercel Function: admin data at /api/admin, behind ADMIN_PASSWORD.
import { createAdminHandler } from '../server/admin.js';
import { createStore } from '../server/store.js';

export default createAdminHandler(createStore());
