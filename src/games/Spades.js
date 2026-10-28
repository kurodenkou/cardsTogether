'use strict';

const { TrickGame } = require('./TrickGame');

const WINNING_SCORE = 500;
const LOSING_SCORE = -200;
const BAG_LIMIT = 10;
const BAG_PENALTY = 100;
const NIL_BONUS = 100;

// Partnerships: seats 0 & 2 vs seats 1 & 3
const teamOf = seat => seat % 2;

class Spades extends TrickGame {
  constructor(players, emitCallback) {
    super(players, emitCallback, 'spades');
    this.teamScores = [0, 0];
    this.teamBags = [0, 0];
    this.bids = [null, null, null, null];
    this.spadesBroken = false;
    this.handResults = null;
  }

  _resetScores() {
    this.teamScores = [0, 0];
    this.teamBags = [0, 0];
  }

  _teamName(team) {
    return `${this.players[team].name} & ${this.players[team + 2].name}`;
  }

  _newHand() {
    this.handNumber++;
    this._clearTimer();
    this.dealerIdx = (this.dealerIdx + 1) % 4;
    this._dealHands();
    this.bids = [null, null, null, null];
    this.spadesBroken = false;
    this.handResults = null;
    this.phase = 'bidding';
    this.turnIdx = (this.dealerIdx + 1) % 4;
    this.message = `${this.players[this.turnIdx].name} to bid`;
    this._prompt();
  }

  _handleOther(seat, action, data) {
    if (action !== 'bid' || this.phase !== 'bidding' || this.turnIdx !== seat) return;
    const bid = parseInt(data.bid, 10);
    if (!Number.isInteger(bid) || bid < 0 || bid > 13) return;
    this._placeBid(seat, bid);
  }

  _placeBid(seat, bid) {
    this.bids[seat] = bid;
    if (this.bids.every(b => b !== null)) {
      this.message = `${this.players[seat].name} bids ${bid === 0 ? 'Nil' : bid}. Let's play!`;
      this.turnIdx = -1;
      this.emit();
      this._delay(() => this._startPlay((this.dealerIdx + 1) % 4), 1200);
      return;
    }
    this.turnIdx = (seat + 1) % 4;
    this.message = `${this.players[seat].name} bids ${bid === 0 ? 'Nil' : bid}`;
    this._prompt();
  }

  _validPlays(seat) {
    const hand = this.players[seat].hand;
    const lead = this._leadSuit();
    if (!lead) {
      if (!this.spadesBroken) {
        const nonSpades = hand.filter(c => c.suit !== '♠');
        if (nonSpades.length) return nonSpades;
      }
      return hand.slice();
    }
    const follow = hand.filter(c => c.suit === lead);
    return follow.length ? follow : hand.slice();
  }

  _onCardPlayed(seat, card) {
    if (card.suit === '♠') this.spadesBroken = true;
  }

  _currentWinner() {
    const lead = this._leadSuit();
    let best = this.trick[0];
    for (const t of this.trick) {
      const b = best.card;
      const c = t.card;
      if (c.suit === b.suit) {
        if (c.rankIndex > b.rankIndex) best = t;
      } else if (c.suit === '♠') {
        best = t;
      } else if (c.suit === lead && b.suit !== '♠' && b.suit !== lead) {
        best = t;
      }
    }
    return best;
  }

  _trickWinner() {
    return this._currentWinner().seat;
  }

  _onTrickWon() {}

  _endHand() {
    this.handResults = [0, 1].map(team => {
      const seats = [team, team + 2];
      let points = 0;
      let contractBid = 0;
      let contractTricks = 0;
      let bags = 0;
      const notes = [];

      for (const s of seats) {
        const p = this.players[s];
        if (this.bids[s] === 0) {
          if (p.tricks === 0) {
            points += NIL_BONUS;
            notes.push(`${p.name} made Nil`);
          } else {
            points -= NIL_BONUS;
            bags += p.tricks;
            notes.push(`${p.name} failed Nil`);
          }
        } else {
          contractBid += this.bids[s];
          contractTricks += p.tricks;
        }
      }

      if (contractBid > 0) {
        if (contractTricks >= contractBid) {
          points += contractBid * 10;
          bags += contractTricks - contractBid;
        } else {
          points -= contractBid * 10;
          notes.push('set!');
        }
      }
      points += bags;

      this.teamBags[team] += bags;
      if (this.teamBags[team] >= BAG_LIMIT) {
        this.teamBags[team] -= BAG_LIMIT;
        points -= BAG_PENALTY;
        notes.push(`bag penalty -${BAG_PENALTY}`);
      }
      this.teamScores[team] += points;

      return {
        name: this._teamName(team),
        bid: contractBid,
        tricks: seats.reduce((s, i) => s + this.players[i].tricks, 0),
        points,
        total: this.teamScores[team],
        bags: this.teamBags[team],
        notes
      };
    });

    const [a, b] = this.teamScores;
    const someoneWon = (a >= WINNING_SCORE || b >= WINNING_SCORE) && a !== b;
    const someoneLost = a <= LOSING_SCORE || b <= LOSING_SCORE;
    if (someoneWon || someoneLost) {
      const winner = a > b ? 0 : 1;
      this.phase = 'game_over';
      this.message = `Game over! ${this._teamName(winner)} win ${Math.max(a, b)} to ${Math.min(a, b)}`;
    } else {
      this.phase = 'hand_over';
      this.message = 'Hand complete';
    }
    this.turnIdx = -1;
    this.emit();
  }

  // ---- Bots ----
  _botTurn(seat) {
    if (this.turnIdx !== seat) return;
    if (this.phase === 'bidding') {
      this._placeBid(seat, this._botBid(seat));
    } else if (this.phase === 'playing') {
      this._playCard(seat, this._botChooseCard(seat));
    }
  }

  _botBid(seat) {
    const hand = this.players[seat].hand;
    let est = 0;
    for (const suit of ['♣', '♦', '♥']) {
      const cards = hand.filter(c => c.suit === suit);
      const has = r => cards.some(c => c.rank === r);
      if (has('A')) est += 1;
      if (has('K') && cards.length >= 2 && cards.length <= 5) est += 0.8;
      if (has('Q') && cards.length >= 3 && cards.length <= 4) est += 0.4;
      if (cards.length <= 1) est += 0.5; // short suit — trumping chances
    }
    const spades = hand.filter(c => c.suit === '♠');
    for (const c of spades) {
      if (c.rank === 'A' || c.rank === 'K') est += 1;
      else if (c.rank === 'Q' && spades.length >= 3) est += 0.8;
    }
    est += Math.max(0, spades.length - 3) * 0.9;

    // Partner's bid already covers part of the team's contract — shade down slightly
    const partnerBid = this.bids[(seat + 2) % 4];
    if (partnerBid !== null && partnerBid >= 5) est -= 0.5;

    return Math.max(1, Math.min(13, Math.round(est)));
  }

  _botChooseCard(seat) {
    const valid = this._validPlays(seat);
    const lead = this._leadSuit();
    const { lowest, highest } = TrickGame;
    const nonSpades = valid.filter(c => c.suit !== '♠');

    if (!lead) {
      const aces = nonSpades.filter(c => c.rank === 'A');
      if (aces.length) return aces[0];
      if (nonSpades.length) return lowest(nonSpades);
      return highest(valid);
    }

    const winner = this._currentWinner();
    const partnerWinning = winner.seat === (seat + 2) % 4;
    const beats = c => {
      const w = winner.card;
      if (c.suit === w.suit) return c.rankIndex > w.rankIndex;
      return c.suit === '♠';
    };

    const following = valid[0].suit === lead;
    if (following) {
      if (partnerWinning) return lowest(valid);
      const winners = valid.filter(beats);
      return winners.length ? lowest(winners) : lowest(valid);
    }

    // Void in the led suit
    if (partnerWinning) return lowest(nonSpades.length ? nonSpades : valid);
    const trumps = valid.filter(c => c.suit === '♠' && beats(c));
    if (trumps.length) return lowest(trumps);
    return lowest(nonSpades.length ? nonSpades : valid);
  }

  _extraState(mySeat, spectator) {
    let myActions = [];
    if (!spectator && this.turnIdx === mySeat) {
      if (this.phase === 'bidding') myActions = ['bid'];
      else if (this.phase === 'playing') myActions = ['play'];
    }
    return {
      bids: this.bids,
      spadesBroken: this.spadesBroken,
      teams: [0, 1].map(t => ({
        name: this._teamName(t),
        score: this.teamScores[t],
        bags: this.teamBags[t],
        bid: [t, t + 2].reduce((s, i) => s + (this.bids[i] || 0), 0),
        tricks: this.players[t].tricks + this.players[t + 2].tricks
      })),
      handResults: this.handResults,
      myActions
    };
  }
}

module.exports = Spades;
