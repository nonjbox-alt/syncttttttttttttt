import { createServer } from 'node:http';
import { createApp, setupWebSocketServer } from '../server.ts';

const app = await createApp();
const server = createServer(app);
setupWebSocketServer(server);

export default server;
