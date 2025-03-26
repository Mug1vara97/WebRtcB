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
  pingTimeout: 10000,
  pingInterval: 30000
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  socket.on('joinRoom', ({ roomId, username }) => {
    if (!username || !roomId) {
      return socket.emit('error', 'Username and room ID are required');
    }

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }

    const room = rooms.get(roomId);
    
    // Проверка уникальности имени в комнате
    if (Array.from(room.values()).some(user => user.name === username)) {
      return socket.emit('error', 'Username is already taken');
    }

    // Добавляем пользователя в комнату
    room.set(socket.id, { id: socket.id, name: username });
    socket.join(roomId);
    socket.roomId = roomId;

    // Отправляем текущий список участников новому пользователю
    const participants = Array.from(room.values());
    socket.emit('participants', participants);

    // Уведомляем остальных о новом участнике
    socket.to(roomId).emit('newParticipant', { id: socket.id, name: username });
  });

  socket.on('signal', ({ targetId, signal }) => {
    io.to(targetId).emit('signal', { 
      senderId: socket.id, 
      signal 
    });
  });

  socket.on('disconnect', () => {
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      if (room.has(socket.id)) {
        room.delete(socket.id);
        
        // Удаляем комнату, если она пуста
        if (room.size === 0) {
          rooms.delete(socket.roomId);
        } else {
          // Уведомляем о выходе участника
          io.to(socket.roomId).emit('participantLeft', socket.id);
        }
      }
    }
  });
});

server.listen(8080, () => {
  console.log('Server running on port 8080');
});