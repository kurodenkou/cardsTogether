'use strict';

const socket = io();

// DOM elements
const nameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const errorDiv = document.getElementById('lobby-error');

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    errorDiv.classList.add('hidden');
  });
});

function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.classList.remove('hidden');
}

function getPlayerName() {
  return nameInput.value.trim();
}

btnCreate.addEventListener('click', () => {
  const name = getPlayerName();
  if (!name) { showError('Please enter your name first.'); nameInput.focus(); return; }
  errorDiv.classList.add('hidden');
  btnCreate.disabled = true;
  socket.emit('create_room', { playerName: name });
});

btnJoin.addEventListener('click', () => {
  const name = getPlayerName();
  if (!name) { showError('Please enter your name first.'); nameInput.focus(); return; }
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length < 4) { showError('Please enter the room code.'); roomCodeInput.focus(); return; }
  errorDiv.classList.add('hidden');
  btnJoin.disabled = true;
  socket.emit('join_room', { playerName: name, roomId: code });
});

nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnCreate.click();
});
roomCodeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnJoin.click();
});
roomCodeInput.addEventListener('input', () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

// On successful join, store state and redirect
socket.on('room_joined', (state) => {
  sessionStorage.setItem('roomState', JSON.stringify(state));
  window.location.href = '/room';
});

socket.on('error', ({ message }) => {
  showError(message);
  btnCreate.disabled = false;
  btnJoin.disabled = false;
});
