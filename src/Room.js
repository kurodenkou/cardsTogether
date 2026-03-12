'use strict';

const Blackjack = require('./games/Blackjack');
const Poker = require('./games/Poker');

let _computerCounter = 0;
const BOT_NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'];

class RoomPlayer {
  constructor(id, name, isComputer = false) {
    this.id = id;
    this.name = name;
    this.isComputer = isComputer;
    this.disconnected = false;
    this.chips = 1000;
  }
}

class Room {
  constructor(id, organizerId, organizerName) {
    this.id = id;
    this.organizerId = organizerId;
    this.players = [new RoomPlayer(organizerId, organizerName)];
    this.selectedGame = null;
    this.phase = 'lobby'; // lobby, playing
    this.game = null;
    this.onStateChange = null; // set by server
  }

  _emit() {
    if (this.onStateChange) this.onStateChange();
  }

  addHumanPlayer(id, name) {
    if (!this.players.find(p => p.id === id)) {
      this.players.push(new RoomPlayer(id, name));
    }
  }

  addComputerPlayer() {
    const existing = this.players.filter(p => p.isComputer).length;
    const name = `Bot ${BOT_NAMES[existing % BOT_NAMES.length]}`;
    const id = `bot_${++_computerCounter}`;
    this.players.push(new RoomPlayer(id, name, true));
  }

  removePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
  }

  startGame() {
    if (this.phase !== 'lobby') return;
    if (!this.selectedGame) return;
    if (this.players.length < 1) return;

    this.phase = 'playing';

    const emitCb = () => this._emit();

    if (this.selectedGame === 'blackjack') {
      this.game = new Blackjack(this.players, emitCb);
    } else {
      this.game = new Poker(this.players, emitCb);
    }

    this.game.start();
    // start() calls emit internally after setup
  }

  handleAction(playerId, action, data) {
    if (this.game) this.game.handleAction(playerId, action, data);
  }

  nextRound() {
    if (this.game) this.game.nextRound();
  }

  returnToLobby() {
    this.phase = 'lobby';
    this.game = null;
    // Sync chip counts back from game players if needed
  }

  getStateFor(playerId) {
    const base = {
      roomId: this.id,
      phase: this.phase,
      selectedGame: this.selectedGame,
      organizerId: this.organizerId,
      isOrganizer: this.organizerId === playerId,
      myId: playerId,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        isComputer: p.isComputer,
        disconnected: p.disconnected,
        chips: p.chips
      }))
    };

    if (this.game) {
      base.gameState = this.game.getStateFor(playerId);
    }

    return base;
  }
}

module.exports = Room;
