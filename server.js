const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// CORS настройки
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Хранилище комнат
const rooms = new Map();

// Обработка подключений Socket.IO
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  socket.on('joinRoom', async ({ roomId, username }) => {
    if (!username) {
      socket.emit('error', 'Username cannot be empty');
      return;
    }

    // Сохраняем username в socket
    socket.username = username;
    socket.roomId = roomId;

    // Входим в комнату
    await socket.join(roomId);

    // Инициализируем комнату если её нет
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    // Получаем текущих пользователей
    const roomUsers = Array.from(rooms.get(roomId));
    
    // Добавляем нового пользователя
    rooms.get(roomId).add(username);

    // Отправляем текущих пользователей новому клиенту
    socket.emit('usersInRoom', roomUsers);

    // Оповещаем остальных о новом пользователе
    socket.to(roomId).emit('userJoined', username);
  });

  // В обработчике sendSignal
socket.on('sendSignal', ({ targetUsername, signal }) => {
    // Находим сокет целевого пользователя
    const targetSocket = Array.from(io.sockets.sockets.values())
      .find(s => s.username === targetUsername && s.roomId === socket.roomId);
    
    if (targetSocket) {
      targetSocket.emit('receiveSignal', {
        senderId: socket.username,
        signal: signal
      });
    }
  });

  socket.on('disconnect', () => {
    if (socket.roomId && socket.username && rooms.has(socket.roomId)) {
      rooms.get(socket.roomId).delete(socket.username);
      socket.to(socket.roomId).emit('userLeft', socket.username);
    }
    console.log(`Disconnected: ${socket.id}`);
  });
});

// Health check endpoints
app.get('/', (req, res) => {
  res.send('WebRTC Server is running');
});

app.get('/ping', (req, res) => {
  res.json({ status: 'OK', port: process.env.PORT || 8080 });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});