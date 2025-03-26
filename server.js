const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 5000,
  pingInterval: 10000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 30000,
    skipMiddlewares: true
  }
});

io.engine.on("connection", (socket) => {
  socket.setNoDelay(true);
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  socket.on('joinRoom', ({ roomId, username }, callback) => {
    try {
      if (!username) throw new Error('Username is required');

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
      }

      const roomUsers = rooms.get(roomId);
      
      if (Array.from(roomUsers.values()).includes(username)) {
        throw new Error('Username is already taken');
      }

      roomUsers.set(socket.id, username);
      socket.username = username;
      socket.roomId = roomId;
      socket.join(roomId);

      const others = Array.from(roomUsers.values()).filter(u => u !== username);
      callback({ success: true, users: others });

      socket.to(roomId).emit('userJoined', username);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on('sendSignal', ({ targetUsername, signal }, callback) => {
    try {
      const roomUsers = rooms.get(socket.roomId);
      if (!roomUsers) throw new Error('Room not found');

      const targetSocketId = Array.from(roomUsers.entries())
        .find(([id, name]) => name === targetUsername)?.[0];
      
      if (!targetSocketId) throw new Error('User not found');

      io.to(targetSocketId).emit('receiveSignal', {
        senderId: socket.username,
        signal
      });
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`Disconnected: ${socket.id} (${reason})`);
    if (socket.roomId && socket.username && rooms.has(socket.roomId)) {
      const roomUsers = rooms.get(socket.roomId);
      const username = roomUsers.get(socket.id);
      roomUsers.delete(socket.id);
      
      if (roomUsers.size === 0) {
        rooms.delete(socket.roomId);
      } else if (username) {
        socket.to(socket.roomId).emit('userLeft', username);
      }
    }
  });

  socket.on('reconnect_attempt', () => {
    console.log(`Reconnect attempt: ${socket.id}`);
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    rooms: Array.from(rooms.keys()),
    users: Array.from(rooms.values()).flatMap(usersMap => Array.from(usersMap.values()))
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});