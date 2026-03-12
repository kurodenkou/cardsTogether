'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Room = require('./src/Room');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// In-memory state
const rooms = new Map();           // roomId -> Room
const socketRoom = new Map();      // socketId -> roomId
const disconnectTimers = new Map(); // socketId -> timeoutId (grace period for page nav)

app.use(express.static(path.join(__dirname, 'public')));

app.get('/room', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function emitRoomState(room) {
  for (const player of room.players) {
    if (player.isComputer) continue;
    const sock = io.sockets.sockets.get(player.id);
    if (sock) {
      sock.emit('room_state', room.getStateFor(player.id));
    }
  }
}

io.on('connection', (socket) => {
  // Create a new room
  socket.on('create_room', ({ playerName }) => {
    if (!playerName || !playerName.trim()) {
      return socket.emit('error', { message: 'Please enter your name.' });
    }
    const name = playerName.trim().slice(0, 20);
    let roomId;
    do { roomId = generateRoomId(); } while (rooms.has(roomId));

    const room = new Room(roomId, socket.id, name);
    room.onStateChange = () => emitRoomState(room);
    rooms.set(roomId, room);
    socketRoom.set(socket.id, roomId);
    socket.join(roomId);

    socket.emit('room_joined', room.getStateFor(socket.id));
  });

  // Join an existing room
  socket.on('join_room', ({ roomId, playerName }) => {
    if (!playerName || !playerName.trim()) {
      return socket.emit('error', { message: 'Please enter your name.' });
    }
    const name = playerName.trim().slice(0, 20);
    const id = (roomId || '').toUpperCase().trim();
    const room = rooms.get(id);

    if (!room) {
      return socket.emit('error', { message: 'Room not found. Check the code and try again.' });
    }
    if (room.phase !== 'lobby') {
      return socket.emit('error', { message: 'Game already in progress in that room.' });
    }
    const humanCount = room.players.filter(p => !p.isComputer).length;
    if (humanCount >= 8) {
      return socket.emit('error', { message: 'Room is full (8 players max).' });
    }

    room.addHumanPlayer(socket.id, name);
    socketRoom.set(socket.id, id);
    socket.join(id);

    // Send room_joined to the new player (triggers redirect in lobby.js)
    socket.emit('room_joined', room.getStateFor(socket.id));
    // Update existing players
    socket.to(id).emit('room_state', room.getStateFor(room.organizerId));
    // Emit tailored state to all other human players
    for (const player of room.players) {
      if (player.isComputer || player.id === socket.id) continue;
      const sock = io.sockets.sockets.get(player.id);
      if (sock) sock.emit('room_state', room.getStateFor(player.id));
    }
  });

  // Select game type (organizer only)
  socket.on('select_game', ({ gameType }) => {
    const room = rooms.get(socketRoom.get(socket.id));
    if (!room || room.organizerId !== socket.id) return;
    if (room.phase !== 'lobby') return;
    if (!['blackjack', 'poker'].includes(gameType)) return;

    room.selectedGame = gameType;
    emitRoomState(room);
  });

  // Add a computer player (organizer only)
  socket.on('add_computer', () => {
    const room = rooms.get(socketRoom.get(socket.id));
    if (!room || room.organizerId !== socket.id) return;
    if (room.phase !== 'lobby') return;
    if (room.players.length >= 8) {
      return socket.emit('error', { message: 'Room is full.' });
    }

    room.addComputerPlayer();
    emitRoomState(room);
  });

  // Remove a player from lobby (organizer only)
  socket.on('remove_player', ({ playerId }) => {
    const room = rooms.get(socketRoom.get(socket.id));
    if (!room || room.organizerId !== socket.id) return;
    if (room.phase !== 'lobby') return;
    if (playerId === socket.id) return; // Can't remove yourself
    const target = room.players.find(p => p.id === playerId);
    if (!target) return;

    room.removePlayer(playerId);
    // Notify removed human player
    if (!target.isComputer) {
      const targetSock = io.sockets.sockets.get(playerId);
      if (targetSock) targetSock.emit('removed_from_room');
    }
    emitRoomState(room);
  });

  // Start the game (organizer only)
  socket.on('start_game', () => {
    const room = rooms.get(socketRoom.get(socket.id));
    if (!room || room.organizerId !== socket.id) return;
    if (room.phase !== 'lobby') return;
    if (!room.selectedGame) return socket.emit('error', { message: 'Select a game first.' });
    if (room.players.length < 2) return socket.emit('error', { message: 'Need at least 2 players.' });

    room.startGame();
    // onStateChange handles the initial emit
  });

  // In-game action
  socket.on('game_action', ({ action, data }) => {
    const room = rooms.get(socketRoom.get(socket.id));
    if (!room || !room.game || room.phase !== 'playing') return;

    room.handleAction(socket.id, action, data || {});
    // emitRoomState called via onStateChange
  });

  // Organizer starts next round
  socket.on('next_round', () => {
    const room = rooms.get(socketRoom.get(socket.id));
    if (!room || room.organizerId !== socket.id) return;
    room.nextRound();
  });

  // Organizer returns to lobby
  socket.on('return_to_lobby', () => {
    const room = rooms.get(socketRoom.get(socket.id));
    if (!room || room.organizerId !== socket.id) return;
    room.returnToLobby();
    emitRoomState(room);
  });

  // Rejoin room after page navigation (new socket, same player)
  socket.on('rejoin_room', ({ roomId, myId: oldId }) => {
    const id = (roomId || '').toUpperCase().trim();
    const room = rooms.get(id);
    if (!room) {
      return socket.emit('error', { message: 'Room not found. Please rejoin from the lobby.' });
    }
    if (socketRoom.has(socket.id)) return; // Already tracked

    const player = room.players.find(p => p.id === oldId);
    if (!player) {
      return socket.emit('error', { message: 'Session expired. Please rejoin from the lobby.' });
    }

    // Cancel the pending disconnect cleanup
    if (disconnectTimers.has(oldId)) {
      clearTimeout(disconnectTimers.get(oldId));
      disconnectTimers.delete(oldId);
    }

    // Re-map the player to the new socket
    const oldSocketId = player.id;
    player.id = socket.id;
    player.disconnected = false;
    if (room.organizerId === oldSocketId) room.organizerId = socket.id;

    // Update game state player IDs if game is active
    if (room.game && room.game.players) {
      const gp = room.game.players.find(p => p.id === oldSocketId);
      if (gp) gp.id = socket.id;
      // Update betting queue in poker
      if (room.game.bettingQueue) {
        room.game.bettingQueue = room.game.bettingQueue.map(pid => pid === oldSocketId ? socket.id : pid);
      }
    }

    socketRoom.delete(oldSocketId);
    socketRoom.set(socket.id, id);
    socket.join(id);

    emitRoomState(room);
  });

  // Disconnect handling — use a grace period so page navigation doesn't nuke the room
  socket.on('disconnect', () => {
    const roomId = socketRoom.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) { socketRoom.delete(socket.id); return; }

    // Mark player as temporarily disconnected but don't remove yet
    const p = room.players.find(x => x.id === socket.id);
    if (p) p.disconnected = true;

    // Give the client 10 seconds to reconnect (covers page navigation to /room)
    const timerId = setTimeout(() => {
      disconnectTimers.delete(socket.id);
      socketRoom.delete(socket.id);

      const r = rooms.get(roomId);
      if (!r) return;

      if (r.phase === 'lobby') {
        r.removePlayer(socket.id);
        const humans = r.players.filter(x => !x.isComputer);
        if (humans.length === 0) { rooms.delete(roomId); return; }
        if (r.organizerId === socket.id) r.organizerId = humans[0].id;
        emitRoomState(r);
      } else {
        // Already marked disconnected above; just transfer organizer if needed
        if (r.organizerId === socket.id) {
          const next = r.players.find(x => !x.isComputer && !x.disconnected);
          if (next) r.organizerId = next.id;
        }
        emitRoomState(r);
      }
    }, 10000);

    disconnectTimers.set(socket.id, timerId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Cards Together running at http://localhost:${PORT}`);
});
