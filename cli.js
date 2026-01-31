#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
const server = spawn('node', [serverPath], { stdio: 'inherit' });

server.on('error', (err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});
