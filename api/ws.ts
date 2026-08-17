import { createServer } from 'node:http';
import { createApp, setupWebSocketServer } from '../dist/server.cjs';

const app = await createApp();
const server = createServer(app);
setupWebSocketServer(server);

export default server;
