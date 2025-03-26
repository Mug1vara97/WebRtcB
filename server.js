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
  pingInterval: 10000
});

io.engine.on("connection", (socket) => {
  socket.setNoDelay(true);
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  socket.on('joinRoom', ({ roomId, username }) => {
    if (!username) {
      return socket.emit('error', 'Username is required');
    }

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    } else if (rooms.get(roomId).has(username)) {
      return socket.emit('error', 'Username is already taken');
    }

    socket.username = username;
    socket.roomId = roomId;
    socket.join(roomId);
    rooms.get(roomId).add(username);

    // Отправляем список существующих пользователей новому участнику
    const others = Array.from(rooms.get(roomId)).filter(u => u !== username);
    socket.emit('usersInRoom', others);

    // Уведомляем других о новом пользователе
    socket.to(roomId).emit('userJoined', username);
  });

  socket.on('sendSignal', ({ targetUsername, signal }) => {
    const targetSocket = Array.from(io.sockets.sockets.values())
      .find(s => s.username === targetUsername && s.roomId === socket.roomId);
    
    if (targetSocket) {
      targetSocket.emit('receiveSignal', {
        senderId: socket.username,
        signal
      });
    } else {
      console.log(`Target user ${targetUsername} not found`);
    }
  });

  socket.on('disconnect', () => {
    if (socket.roomId && socket.username && rooms.has(socket.roomId)) {
      rooms.get(socket.roomId).delete(socket.username);
      socket.to(socket.roomId).emit('userLeft', socket.username);
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    rooms: Array.from(rooms.keys()),
    users: Array.from(rooms.values()).flatMap(set => Array.from(set)) 
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});