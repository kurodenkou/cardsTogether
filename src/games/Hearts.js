'use strict';

const { TrickGame, sortHand, sameCard } = require('./TrickGame');

const PASS_DIRS = ['left', 'right', 'across', 'none'];
const GAME_END_SCORE = 100;

function cardPoints(card) {
  if (card.suit === '♥') return 1;
  if (card.suit === '♠' && card.rank === 'Q') return 13;
  return 0;
}

const isQueenOfSpades = c => c.suit === '♠' && c.rank === 'Q';

class Hearts extends TrickGame {
  constructor(players, emitCallback) {
    super(players, emitCallback, 'hearts');
    for (const p of this.players) { p.score = 0; p.handPoints = 0; }
    this.passDir = 'none';
    this.passed = [null, null, null, null];
    this.received = [[], [], [], []];
    this.heartsBroken = false;
    this.handResults = null;
  }

  _resetScores() {
    for (const p of this.players) p.score = 0;
  }

  _newHand() {
    this.handNumber++;
    this._clearTimer();
    this._dealHands();
    for (const p of this.players) p.handPoints = 0;
    this.heartsBroken = false;
    this.handResults = null;
    this.received = [[], [], [], []];
    this.passDir = PASS_DIRS[(this.handNumber - 1) % 4];

    if (this.passDir === 'none') {
      this._beginTricks();
      return;
    }

    this.phase = 'passing';
    this.turnIdx = -1;
    this.passed = [null, null, null, null];
    this.message = `Choose 3 cards to pass ${this.passDir}`;
    this.players.forEach((p, i) => {
      if (p.isComputer) this.passed[i] = this._botChoosePass(i);
    });
    this.emit();
    this._checkPasses();
  }

  _passTarget(seat) {
    if (this.passDir === 'left') return (seat + 1) % 4;
    if (this.passDir === 'right') return (seat + 3) % 4;
    return (seat + 2) % 4;
  }

  _handleOther(seat, action, data) {
    if (action !== 'pass' || this.phase !== 'passing' || this.passed[seat]) return;
    const cards = Array.isArray(data.cards) ? data.cards : [];
    if (cards.length !== 3) return;
    const hand = this.players[seat].hand;
    const chosen = [];
    for (const c of cards) {
      const card = hand.find(h => sameCard(h, c));
      if (!card || chosen.includes(card)) return;
      chosen.push(card);
    }
    this.passed[seat] = chosen;
    this.emit();
    this._checkPasses();
  }

  _checkPasses() {
    if (this.passed.some(p => !p)) return;
    this.passed.forEach((cards, seat) => {
      const from = this.players[seat];
      from.hand = from.hand.filter(c => !cards.includes(c));
    });
    this.passed.forEach((cards, seat) => {
      const target = this._passTarget(seat);
      this.players[target].hand.push(...cards);
      this.received[target] = cards;
    });
    for (const p of this.players) sortHand(p.hand);
    this.passed = [null, null, null, null];
    this.phase = 'passed';
    this.message = 'Cards passed!';
    this.emit();
    this._delay(() => this._beginTricks(), 1500);
  }

  _beginTricks() {
    const leader = this.players.findIndex(p => p.hand.some(c => c.suit === '♣' && c.rank === '2'));
    this._startPlay(leader);
    this.message = `${this.players[leader].name} leads the 2♣`;
    this.emit();
  }

  _validPlays(seat) {
    const hand = this.players[seat].hand;
    const lead = this._leadSuit();
    const firstTrick = this.trickNumber === 0;

    if (!lead) {
      if (firstTrick) return hand.filter(c => c.suit === '♣' && c.rank === '2');
      if (!this.heartsBroken) {
        const nonHearts = hand.filter(c => c.suit !== '♥');
        if (nonHearts.length) return nonHearts;
      }
      return hand.slice();
    }

    const follow = hand.filter(c => c.suit === lead);
    if (follow.length) return follow;
    if (firstTrick) {
      const safe = hand.filter(c => cardPoints(c) === 0);
      if (safe.length) return safe;
    }
    return hand.slice();
  }

  _onCardPlayed(seat, card) {
    if (card.suit === '♥' && !this.heartsBroken) {
      this.heartsBroken = true;
    }
  }

  _trickWinner() {
    const lead = this._leadSuit();
    let best = this.trick[0];
    for (const t of this.trick) {
      if (t.card.suit === lead && t.card.rankIndex > best.card.rankIndex) best = t;
    }
    return best.seat;
  }

  _onTrickWon(seat, cards) {
    this.players[seat].handPoints += cards.reduce((s, c) => s + cardPoints(c), 0);
  }

  _endHand() {
    const shooter = this.players.findIndex(p => p.handPoints === 26);
    this.handResults = this.players.map((p, i) => {
      let pts = p.handPoints;
      if (shooter !== -1) pts = i === shooter ? 0 : 26;
      p.score += pts;
      return { name: p.name, points: pts, total: p.score };
    });

    const maxScore = Math.max(...this.players.map(p => p.score));
    if (maxScore >= GAME_END_SCORE) {
      const minScore = Math.min(...this.players.map(p => p.score));
      const winners = this.players.filter(p => p.score === minScore).map(p => p.name);
      this.phase = 'game_over';
      this.message = `Game over! ${winners.join(' & ')} win${winners.length === 1 ? 's' : ''} with ${minScore} points`;
    } else {
      this.phase = 'hand_over';
      this.message = shooter !== -1
        ? `${this.players[shooter].name} shot the moon! 🌙`
        : 'Hand complete';
    }
    this.turnIdx = -1;
    this.emit();
  }

  // ---- Bots ----
  _botChoosePass(seat) {
    const hand = this.players[seat].hand;
    const spadeCount = hand.filter(c => c.suit === '♠').length;
    const danger = c => {
      if (isQueenOfSpades(c)) return 100;
      if (c.suit === '♠' && (c.rank === 'A' || c.rank === 'K')) return spadeCount < 4 ? 90 : 5;
      if (c.suit === '♥') return 20 + c.rankIndex;
      return c.rankIndex;
    };
    return hand.slice().sort((a, b) => danger(b) - danger(a)).slice(0, 3);
  }

  _botTurn(seat) {
    if (this.phase !== 'playing' || this.turnIdx !== seat) return;
    this._playCard(seat, this._botChooseCard(seat));
  }

  _botChooseCard(seat) {
    const valid = this._validPlays(seat);
    const lead = this._leadSuit();
    const { lowest, highest } = TrickGame;

    if (!lead) {
      const safe = valid.filter(c => c.suit !== '♥' && !isQueenOfSpades(c));
      return lowest(safe.length ? safe : valid);
    }

    const following = valid[0].suit === lead;
    if (following) {
      const winning = this.trick
        .filter(t => t.card.suit === lead)
        .reduce((a, b) => (b.card.rankIndex > a.card.rankIndex ? b : a)).card;
      const under = valid.filter(c => c.rankIndex < winning.rankIndex);
      if (under.length) return highest(under);
      const trickPoints = this.trick.reduce((s, t) => s + cardPoints(t.card), 0);
      const isLast = this.trick.length === 3;
      if (isLast && trickPoints === 0) {
        // Safe to win — get rid of a high card, but never eat the Queen ourselves
        const noQueen = valid.filter(c => !isQueenOfSpades(c));
        return highest(noQueen.length ? noQueen : valid);
      }
      return lowest(valid);
    }

    // Can't follow — dump the most dangerous card
    const queen = valid.find(isQueenOfSpades);
    if (queen) return queen;
    const highSpades = valid.filter(c => c.suit === '♠' && (c.rank === 'A' || c.rank === 'K'));
    if (highSpades.length) return highSpades[0];
    const hearts = valid.filter(c => c.suit === '♥');
    if (hearts.length) return highest(hearts);
    return highest(valid);
  }

  _extraState(mySeat, spectator) {
    return {
      passDir: this.passDir,
      heartsBroken: this.heartsBroken,
      iHavePassed: !spectator && !!this.passed[mySeat],
      passedSeats: this.passed.map(Boolean),
      received: spectator ? [] : this.received[mySeat].map(c => c.toJSON()),
      handResults: this.handResults,
      seatScores: this.players.map(p => ({ score: p.score, handPoints: p.handPoints })),
      myActions: this._actionsFor(mySeat, spectator)
    };
  }

  _actionsFor(seat, spectator) {
    if (spectator) return [];
    if (this.phase === 'passing' && !this.passed[seat]) return ['pass'];
    if (this.phase === 'playing' && this.turnIdx === seat) return ['play'];
    return [];
  }
}

module.exports = Hearts;
