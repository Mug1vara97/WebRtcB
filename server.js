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
  }
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  socket.on('joinRoom', ({ roomId, username }) => {
    if (!username) {
      return socket.emit('error', 'Username is required');
    }

    socket.username = username;
    socket.roomId = roomId;
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    const users = Array.from(rooms.get(roomId));
    rooms.get(roomId).add(username);

    socket.emit('usersInRoom', users);
    socket.to(roomId).emit('userJoined', username);
  });

  socket.on('sendSignal', ({ targetUsername, signal }) => {
    const targetSocket = findSocketByUsername(targetUsername);
    if (targetSocket) {
      targetSocket.emit('receiveSignal', {
        senderId: socket.username,
        signal
      });
    }
  });

  socket.on('disconnect', () => {
    if (socket.roomId && socket.username && rooms.has(socket.roomId)) {
      rooms.get(socket.roomId).delete(socket.username);
      socket.to(socket.roomId).emit('userLeft', socket.username);
    }
  });

  function findSocketByUsername(username) {
    return Array.from(io.sockets.sockets.values())
      .find(s => s.username === username && s.roomId === socket.roomId);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', users: Array.from(rooms.values()).flatMap(set => Array.from(set)) });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});