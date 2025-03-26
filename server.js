// server.js
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

// Middleware для оптимизации
io.use((socket, next) => {
  socket.setNoDelay(true); // Отключаем алгоритм Нейгла
  next();
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Обработчик подключения к комнате
socket.on('joinRoom', ({ roomId, username }) => {
  if (!username) return socket.emit('error', 'Username is required');

  // Проверка уникальности имени в комнате
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }

  const roomUsers = rooms.get(roomId);
  if (roomUsers.has(username)) {
    return socket.emit('error', 'Username is already taken');
  }

  roomUsers.add(username);
  socket.username = username;
  socket.roomId = roomId;
  socket.join(roomId);

  // Отправляем список пользователей без текущего
  const others = Array.from(roomUsers).filter(u => u !== username);
  socket.emit('usersInRoom', others);

  // Уведомляем других о новом пользователе
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