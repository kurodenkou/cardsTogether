'use strict';

const { Deck } = require('../Deck');

// Display order for sorted hands: alternating colours
const SUIT_ORDER = { '♣': 0, '♦': 1, '♠': 2, '♥': 3 };

function sortHand(hand) {
  hand.sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || a.rankIndex - b.rankIndex);
}

function sameCard(a, b) {
  return a && b && a.suit === b.suit && a.rank === b.rank;
}

class TrickPlayer {
  constructor(player) {
    this.id = player.id;
    this.name = player.name;
    this.isComputer = player.isComputer;
    this.hand = [];
    this.tricks = 0;
  }
}

/**
 * Shared engine for 4-player trick-taking games (Hearts, Spades).
 * Seats are indexed 0-3 clockwise; seat i+1 is to the left of seat i.
 * Everything internal refers to seats by index so reconnects (which
 * rewrite player ids) don't break game state.
 *
 * Subclasses implement: _newHand(), _validPlays(seat), _trickWinner(),
 * _onCardPlayed(seat, card), _onTrickWon(seat, cards), _endHand(),
 * _botTurn(seat), _handleOther(seat, action, data), _extraState(seat).
 */
class TrickGame {
  constructor(players, emitCallback, gameName) {
    this.gameName = gameName;
    this.players = players.slice(0, 4).map(p => new TrickPlayer(p));
    this.emit = emitCallback;
    this.phase = 'idle';
    this.handNumber = 0;
    this.dealerIdx = Math.floor(Math.random() * 4);
    this.turnIdx = -1;
    this.trick = [];        // [{ seat, card }]
    this.lastTrick = null;  // { plays, winner }
    this.trickNumber = 0;
    this.message = '';
    this._timer = null;
  }

  _clearTimer() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  _delay(fn, ms) {
    this._clearTimer();
    this._timer = setTimeout(fn, ms);
  }

  start() {
    this._newHand();
  }

  _dealHands() {
    const deck = new Deck(1);
    for (const p of this.players) { p.hand = []; p.tricks = 0; }
    for (let i = 0; i < 52; i++) {
      this.players[i % 4].hand.push(deck.deal());
    }
    for (const p of this.players) sortHand(p.hand);
    this.trick = [];
    this.lastTrick = null;
    this.trickNumber = 0;
  }

  _startPlay(leaderIdx) {
    this.phase = 'playing';
    this.trick = [];
    this.turnIdx = leaderIdx;
    this.message = `${this.players[leaderIdx].name} leads`;
    this._prompt();
  }

  // Emit state and let a bot act if it's their turn
  _prompt() {
    this.emit();
    const p = this.players[this.turnIdx];
    if (p && p.isComputer) {
      this._delay(() => this._botTurn(this.turnIdx), 900);
    }
  }

  _leadSuit() {
    return this.trick.length ? this.trick[0].card.suit : null;
  }

  _playCard(seat, card) {
    const p = this.players[seat];
    const idx = p.hand.findIndex(c => sameCard(c, card));
    if (idx === -1) return;
    const [played] = p.hand.splice(idx, 1);
    this.trick.push({ seat, card: played });
    this._onCardPlayed(seat, played);

    if (this.trick.length === 4) {
      this.turnIdx = -1;
      this.emit();
      this._delay(() => this._resolveTrick(), 1400);
    } else {
      this.turnIdx = (seat + 1) % 4;
      this.message = `${this.players[this.turnIdx].name}'s turn`;
      this._prompt();
    }
  }

  _resolveTrick() {
    const winner = this._trickWinner();
    this.players[winner].tricks++;
    this._onTrickWon(winner, this.trick.map(t => t.card));
    this.lastTrick = { plays: this.trick, winner };
    this.trick = [];
    this.trickNumber++;

    if (this.players[winner].hand.length === 0) {
      this._endHand();
      return;
    }
    this.turnIdx = winner;
    this.message = `${this.players[winner].name} takes the trick`;
    this._prompt();
  }

  handleAction(playerId, action, data) {
    const seat = this.players.findIndex(p => p.id === playerId);
    if (seat === -1 || this.players[seat].isComputer) return;

    if (action === 'play') {
      if (this.phase !== 'playing' || this.turnIdx !== seat) return;
      const card = data.card;
      if (!this._validPlays(seat).some(c => sameCard(c, card))) return;
      this._playCard(seat, card);
      return;
    }
    this._handleOther(seat, action, data);
  }

  nextRound() {
    if (this.phase === 'hand_over') {
      this._newHand();
    } else if (this.phase === 'game_over') {
      this._resetScores();
      this.handNumber = 0;
      this._newHand();
    }
  }

  getStateFor(playerId) {
    let mySeat = this.players.findIndex(p => p.id === playerId);
    const spectator = mySeat === -1;
    if (spectator) mySeat = 0;
    const me = this.players[mySeat];
    const playable = (!spectator && this.phase === 'playing' && this.turnIdx === mySeat)
      ? this._validPlays(mySeat)
      : [];

    return {
      game: this.gameName,
      phase: this.phase,
      message: this.message,
      handNumber: this.handNumber,
      mySeat,
      spectator,
      turnSeat: this.turnIdx,
      dealerSeat: this.dealerIdx,
      seats: this.players.map((p, i) => ({
        name: p.name,
        isComputer: p.isComputer,
        cardCount: p.hand.length,
        tricks: p.tricks,
        isMe: !spectator && i === mySeat
      })),
      myHand: spectator ? [] : me.hand.map(c => ({
        ...c.toJSON(),
        playable: playable.some(v => sameCard(v, c))
      })),
      trick: this.trick.map(t => ({ seat: t.seat, card: t.card.toJSON() })),
      lastTrick: this.lastTrick
        ? { winner: this.lastTrick.winner, plays: this.lastTrick.plays.map(t => ({ seat: t.seat, card: t.card.toJSON() })) }
        : null,
      ...this._extraState(mySeat, spectator)
    };
  }

  // ---- Bot helpers ----
  static lowest(cards) {
    return cards.reduce((a, b) => (b.rankIndex < a.rankIndex ? b : a));
  }

  static highest(cards) {
    return cards.reduce((a, b) => (b.rankIndex > a.rankIndex ? b : a));
  }
}

module.exports = { TrickGame, sortHand, sameCard };
