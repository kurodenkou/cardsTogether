'use strict';

const { Deck, RANK_INDEX } = require('../Deck');
const { bestHandFrom7, findWinners, HAND_NAMES } = require('./HandEvaluator');

const SMALL_BLIND = 25;
const BIG_BLIND = 50;
const STARTING_CHIPS = 1000;

class PokerPlayer {
  constructor(player) {
    this.id = player.id;
    this.name = player.name;
    this.isComputer = player.isComputer;
    this.chips = player.chips;
    this.hand = [];
    this.status = 'active'; // active, folded, allin, out
    this.streetBet = 0;     // bet in current street
    this.totalIn = 0;       // total chips in current hand (all streets)
    this.lastAction = null;
    this.handResult = null; // { handName, won }
  }
}

class Poker {
  constructor(players, emitCallback) {
    this.players = players.map(p => new PokerPlayer(p));
    this.emit = emitCallback;
    this.deck = null;
    this.communityCards = [];
    this.pot = 0;
    this.phase = 'idle'; // idle, preflop, flop, turn, river, showdown, hand_over
    this.dealerIdx = 0;
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;
    this.bettingQueue = [];  // playerIds who still need to act
    this.playerActed = new Set();
    this.handNumber = 0;
    this.message = '';
    this.showdownInfo = null;
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

  _activePlayers() {
    return this.players.filter(p => p.status === 'active' || p.status === 'allin');
  }

  _canBetPlayers() {
    return this.players.filter(p => p.status === 'active');
  }

  _newHand() {
    this.handNumber++;
    this.deck = new Deck(1);
    this.communityCards = [];
    this.pot = 0;
    this.showdownInfo = null;

    // Remove busted-out players
    this.players = this.players.filter(p => p.chips > 0);
    if (this.players.length < 2) {
      this.phase = 'hand_over';
      this.message = this.players.length === 1
        ? `${this.players[0].name} wins the game!`
        : 'Not enough players.';
      this.emit();
      return;
    }

    // Reset player states
    for (const p of this.players) {
      p.hand = [];
      p.status = 'active';
      p.streetBet = 0;
      p.totalIn = 0;
      p.lastAction = null;
      p.handResult = null;
    }

    // Move dealer button
    this.dealerIdx = this.handNumber === 1 ? 0 : (this.dealerIdx + 1) % this.players.length;

    // Deal 2 hole cards
    for (const p of this.players) {
      p.hand.push(this.deck.deal(), this.deck.deal());
    }

    // Post blinds
    const n = this.players.length;
    const sbIdx = (this.dealerIdx + 1) % n;
    const bbIdx = (this.dealerIdx + 2) % n;

    this._postBlind(sbIdx, SMALL_BLIND);
    this._postBlind(bbIdx, BIG_BLIND);
    this.currentBet = BIG_BLIND;
    this.minRaise = BIG_BLIND;

    this.phase = 'preflop';
    this.message = `Hand #${this.handNumber} — Place your bets`;

    // Preflop: UTG acts first (after BB)
    const utg = (bbIdx + 1) % n;
    this._setupBettingRound(utg, true);
    this.emit();
    this._scheduleComputerIfNeeded();
  }

  _postBlind(seatIdx, amount) {
    const p = this.players[seatIdx];
    const actual = Math.min(amount, p.chips);
    p.chips -= actual;
    p.streetBet += actual;
    p.totalIn += actual;
    this.pot += actual;
    if (p.chips === 0) p.status = 'allin';
    p.lastAction = actual < amount ? 'all-in' : null;
  }

  _setupBettingRound(startIdx, isPreflop) {
    this.playerActed = new Set();
    this.bettingQueue = [];
    const active = this._canBetPlayers();
    if (active.length === 0) return;

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[(startIdx + i) % this.players.length];
      if (p.status === 'active') {
        this.bettingQueue.push(p.id);
      }
    }

    // For preflop: the BB is already in queue at end and hasn't voluntarily acted,
    // so they get to act even if no one raises (can raise or check).
    // The SB has also only put in a forced bet — same situation.
    // We DON'T add SB/BB to playerActed initially, so they stay in queue.
  }

  _scheduleComputerIfNeeded() {
    if (this.bettingQueue.length === 0) return;
    const nextId = this.bettingQueue[0];
    const nextPlayer = this.players.find(p => p.id === nextId);
    if (nextPlayer && nextPlayer.isComputer) {
      this._delay(() => this._computerPokerTurn(nextPlayer), 1300 + Math.random() * 700);
    }
  }

  handleAction(playerId, action, data) {
    if (!['preflop', 'flop', 'turn', 'river'].includes(this.phase)) return;
    if (this.bettingQueue[0] !== playerId) return;
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.status !== 'active') return;

    const toCall = this.currentBet - player.streetBet;

    this.bettingQueue.shift();

    switch (action) {
      case 'fold':
        player.status = 'folded';
        player.lastAction = 'fold';
        break;

      case 'check':
        if (toCall > 0) return; // illegal
        player.lastAction = 'check';
        this.playerActed.add(playerId);
        break;

      case 'call': {
        const amount = Math.min(toCall, player.chips);
        player.chips -= amount;
        player.streetBet += amount;
        player.totalIn += amount;
        this.pot += amount;
        if (player.chips === 0) player.status = 'allin';
        player.lastAction = player.status === 'allin' ? 'all-in' : 'call';
        this.playerActed.add(playerId);
        break;
      }

      case 'raise': {
        const totalBetTarget = Math.max(
          this.currentBet + this.minRaise,
          data.amount || (this.currentBet + this.minRaise)
        );
        const capped = Math.min(totalBetTarget, player.chips + player.streetBet);
        const additional = capped - player.streetBet;
        const raiseSize = capped - this.currentBet;

        player.chips -= additional;
        player.streetBet = capped;
        player.totalIn += additional;
        this.pot += additional;
        this.minRaise = Math.max(this.minRaise, raiseSize);
        this.currentBet = capped;

        if (player.chips === 0) player.status = 'allin';
        player.lastAction = player.status === 'allin' ? 'all-in' : `raise to ${capped}`;

        // Re-open betting: everyone except this player needs to act again
        this.playerActed.clear();
        this.playerActed.add(playerId);

        // Add active players not already in queue
        for (const p of this.players) {
          if (p.status === 'active' && p.id !== playerId && !this.bettingQueue.includes(p.id)) {
            this.bettingQueue.push(p.id);
          }
        }
        break;
      }

      case 'allin': {
        const allInAmt = player.chips;
        const totalBet = player.streetBet + allInAmt;
        player.chips = 0;
        player.totalIn += allInAmt;
        this.pot += allInAmt;
        player.streetBet = totalBet;
        player.status = 'allin';
        player.lastAction = 'all-in';

        if (totalBet > this.currentBet) {
          const raiseSize = totalBet - this.currentBet;
          if (raiseSize >= this.minRaise) this.minRaise = raiseSize;
          this.currentBet = totalBet;
          this.playerActed.clear();
          this.playerActed.add(playerId);
          for (const p of this.players) {
            if (p.status === 'active' && p.id !== playerId && !this.bettingQueue.includes(p.id)) {
              this.bettingQueue.push(p.id);
            }
          }
        } else {
          this.playerActed.add(playerId);
        }
        break;
      }

      default:
        return;
    }

    // Prune queue: remove players who've matched current bet AND have acted
    this._pruneQueue();

    this.emit();

    // Check if only one active player remains (everyone else folded/allin or folded)
    const stillActive = this.players.filter(p => p.status === 'active' || p.status === 'allin');
    const notFolded = this.players.filter(p => p.status !== 'folded' && p.status !== 'out');

    if (notFolded.length === 1) {
      // Everyone else folded
      this._delay(() => this._awardToLastStanding(), 600);
      return;
    }

    if (this.bettingQueue.length === 0) {
      this._delay(() => this._advanceStreet(), 700);
    } else {
      this._scheduleComputerIfNeeded();
    }
  }

  _pruneQueue() {
    this.bettingQueue = this.bettingQueue.filter(id => {
      const p = this.players.find(x => x.id === id);
      if (!p || p.status !== 'active') return false;
      if (p.streetBet < this.currentBet) return true; // still needs to call
      if (!this.playerActed.has(id)) return true;      // hasn't voluntarily acted
      return false;
    });
  }

  _awardToLastStanding() {
    this.phase = 'hand_over';
    const winner = this.players.find(p => p.status !== 'folded' && p.status !== 'out');
    if (winner) {
      winner.chips += this.pot;
      this.message = `${winner.name} wins ${this.pot} chips (everyone else folded)`;
    }
    this.emit();
  }

  _advanceStreet() {
    // Reset street bets for next betting round
    for (const p of this.players) p.streetBet = 0;
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;

    if (this.phase === 'preflop') {
      this.communityCards.push(this.deck.deal(), this.deck.deal(), this.deck.deal());
      this.phase = 'flop';
      this.message = 'Flop';
    } else if (this.phase === 'flop') {
      this.communityCards.push(this.deck.deal());
      this.phase = 'turn';
      this.message = 'Turn';
    } else if (this.phase === 'turn') {
      this.communityCards.push(this.deck.deal());
      this.phase = 'river';
      this.message = 'River';
    } else if (this.phase === 'river') {
      this._showdown();
      return;
    }

    // Setup next betting round: start from first active player left of dealer
    const firstActIdx = this._firstActiveAfterDealer();
    this._setupBettingRound(firstActIdx, false);
    this.emit();

    // If everyone but one is all-in, skip betting and go to next street
    const canBet = this._canBetPlayers();
    if (canBet.length <= 1) {
      this._delay(() => this._advanceStreet(), 1000);
    } else {
      this._scheduleComputerIfNeeded();
    }
  }

  _firstActiveAfterDealer() {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (this.dealerIdx + i) % n;
      if (this.players[idx].status === 'active') return idx;
    }
    return (this.dealerIdx + 1) % n;
  }

  _showdown() {
    this.phase = 'showdown';

    const eligible = this.players.filter(p => p.status !== 'folded' && p.status !== 'out');

    if (eligible.length === 1) {
      eligible[0].chips += this.pot;
      this.message = `${eligible[0].name} wins!`;
      this.showdownInfo = [];
      this.phase = 'hand_over';
      this.emit();
      return;
    }

    // Build player hands
    const playerHands = eligible.map(p => ({
      id: p.id,
      cards: [...p.hand, ...this.communityCards]
    }));

    const { winners, evaluations } = findWinners(playerHands);

    // Calculate pots (with side pots for all-ins)
    const awards = this._calculatePots(winners, evaluations);

    // Apply awards
    for (const [id, chips] of awards) {
      const p = this.players.find(x => x.id === id);
      if (p) p.chips += chips;
    }

    // Build showdown display info
    this.showdownInfo = evaluations.map(({ id, ev }) => {
      const p = this.players.find(x => x.id === id);
      const won = awards.get(id) || 0;
      return {
        id,
        name: p ? p.name : id,
        hand: p ? p.hand.map(c => c.toJSON()) : [],
        handName: ev ? ev.name : '',
        won,
        isWinner: winners.includes(id)
      };
    });

    const winnerNames = winners.map(id => {
      const p = this.players.find(x => x.id === id);
      return p ? p.name : id;
    });
    this.message = `${winnerNames.join(' & ')} win${winners.length > 1 ? '' : 's'}!`;
    this.phase = 'hand_over';
    this.emit();
  }

  _calculatePots(winners, evaluations) {
    // Simple: if only one winner, they get everything
    // For side pots: find best eligible player for each pot level
    const allPlayers = this.players.filter(p => p.status !== 'out');
    const contributions = new Map(allPlayers.map(p => [p.id, p.totalIn]));
    const eligible = new Set(evaluations.map(e => e.id));

    const sorted = [...contributions.entries()]
      .map(([id, amt]) => ({ id, amt }))
      .sort((a, b) => a.amt - b.amt);

    const awards = new Map();
    let claimed = 0;

    for (let i = 0; i < sorted.length; i++) {
      const level = sorted[i].amt;
      if (level <= claimed) continue;

      const levelDiff = level - claimed;
      const potAmount = levelDiff * (sorted.length - i);
      claimed = level;

      if (potAmount <= 0) continue;

      // Eligible players for this pot: contributed at least `level` AND not folded
      const potEligible = sorted
        .slice(i)
        .map(s => s.id)
        .filter(id => eligible.has(id));

      if (potEligible.length === 0) {
        // Give to eligible player with most in (shouldn't happen normally)
        const fallback = winners[0];
        awards.set(fallback, (awards.get(fallback) || 0) + potAmount);
        continue;
      }

      // Find winner(s) among pot-eligible players
      const potEvals = evaluations.filter(e => potEligible.includes(e.id));
      let bestEv = null;
      for (const { ev } of potEvals) {
        if (!bestEv || (ev && (!bestEv || this._compareEv(ev, bestEv) > 0))) bestEv = ev;
      }
      const potWinners = potEvals
        .filter(e => e.ev && this._compareEv(e.ev, bestEv) === 0)
        .map(e => e.id);

      const share = Math.floor(potAmount / potWinners.length);
      for (const id of potWinners) {
        awards.set(id, (awards.get(id) || 0) + share);
      }
      // Remainder to first winner
      const rem = potAmount - share * potWinners.length;
      if (rem > 0) awards.set(potWinners[0], (awards.get(potWinners[0]) || 0) + rem);
    }

    return awards;
  }

  _compareEv(a, b) {
    if (!a) return -1;
    if (!b) return 1;
    if (a.rank !== b.rank) return a.rank > b.rank ? 1 : -1;
    for (let i = 0; i < Math.min(a.tiebreaker.length, b.tiebreaker.length); i++) {
      if (a.tiebreaker[i] !== b.tiebreaker[i]) return a.tiebreaker[i] > b.tiebreaker[i] ? 1 : -1;
    }
    return 0;
  }

  nextRound() {
    if (this.phase !== 'hand_over') return;
    this._newHand();
  }

  // ---- Computer AI ----

  _computerPokerTurn(player) {
    if (!['preflop', 'flop', 'turn', 'river'].includes(this.phase)) return;
    if (this.bettingQueue[0] !== player.id) return;

    const strength = this._handStrength(player);
    const toCall = this.currentBet - player.streetBet;
    const pot = this.pot;
    const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
    const aggression = 0.25 + Math.random() * 0.5;

    let action = 'fold';
    let raiseAmount;

    if (strength >= 0.75) {
      if (Math.random() < aggression && player.chips > this.minRaise) {
        action = 'raise';
        raiseAmount = this.currentBet + Math.floor(pot * 0.6);
      } else if (toCall > 0) {
        action = 'call';
      } else {
        action = 'check';
      }
    } else if (strength >= 0.45) {
      if (toCall === 0) {
        action = Math.random() < 0.3 ? 'raise' : 'check';
        raiseAmount = this.currentBet + BIG_BLIND * 2;
      } else if (potOdds < strength) {
        action = 'call';
      } else {
        action = 'fold';
      }
    } else if (strength >= 0.2) {
      if (toCall === 0) {
        action = 'check';
      } else if (toCall <= BIG_BLIND && potOdds < 0.3) {
        action = 'call';
      } else {
        action = 'fold';
      }
    } else {
      action = toCall === 0 ? 'check' : 'fold';
    }

    // Don't fold when can check
    if (action === 'fold' && toCall === 0) action = 'check';

    const data = action === 'raise' ? { amount: raiseAmount } : {};
    this.handleAction(player.id, action, data);
  }

  _handStrength(player) {
    const community = this.communityCards;
    if (community.length === 0) {
      return this._preflopStrength(player.hand);
    }
    const allCards = [...player.hand, ...community];
    const ev = bestHandFrom7(allCards);
    return ev ? ev.rank / 8 : 0;
  }

  _preflopStrength(hand) {
    const [c1, c2] = hand;
    const r1 = c1.rankIndex; // 0=2, 12=A
    const r2 = c2.rankIndex;
    const hi = Math.max(r1, r2);
    const lo = Math.min(r1, r2);
    const suited = c1.suit === c2.suit;
    const isPair = r1 === r2;
    const gap = hi - lo;

    if (isPair) return 0.3 + (hi / 12) * 0.55; // 2s=0.3, Aces=0.85
    const base = (hi + lo) / 24; // ~0-1
    const suitBonus = suited ? 0.05 : 0;
    const connectedBonus = gap <= 2 ? 0.05 : 0;
    return Math.min(0.8, base + suitBonus + connectedBonus);
  }

  // ---- State serialization ----

  getStateFor(playerId) {
    const cur = this.bettingQueue[0];
    const n = this.players.length;
    const sbIdx = (this.dealerIdx + 1) % n;
    const bbIdx = (this.dealerIdx + 2) % n;

    return {
      game: 'poker',
      phase: this.phase,
      handNumber: this.handNumber,
      message: this.message,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      currentPlayerId: cur || null,
      dealerId: this.players[this.dealerIdx] ? this.players[this.dealerIdx].id : null,
      sbId: this.players[sbIdx] ? this.players[sbIdx].id : null,
      bbId: this.players[bbIdx] ? this.players[bbIdx].id : null,
      communityCards: this.communityCards.map(c => c.toJSON()),
      showdownInfo: this.showdownInfo,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        isComputer: p.isComputer,
        chips: p.chips,
        streetBet: p.streetBet,
        totalIn: p.totalIn,
        status: p.status,
        lastAction: p.lastAction,
        handResult: p.handResult,
        // Only reveal hole cards to the player themselves (or at showdown)
        hand: (p.id === playerId || this.phase === 'showdown' || this.phase === 'hand_over')
          ? p.hand.map(c => c.toJSON())
          : p.hand.map(() => ({ hidden: true })),
        cardCount: p.hand.length,
        isCurrentPlayer: cur === p.id,
        isMe: p.id === playerId,
        isDealer: this.players[this.dealerIdx] && this.players[this.dealerIdx].id === p.id,
        isSB: this.players[sbIdx] && this.players[sbIdx].id === p.id,
        isBB: this.players[bbIdx] && this.players[bbIdx].id === p.id
      })),
      myActions: this._getActionsFor(playerId),
      myHand: this._getMyHandInfo(playerId)
    };
  }

  _getMyHandInfo(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.hand.length === 0) return null;
    const allCards = [...player.hand, ...this.communityCards];
    if (allCards.length < 5) {
      // Preflop — just show hole card strength description
      const strength = this._preflopStrength(player.hand);
      if (strength >= 0.75) return 'Strong hand';
      if (strength >= 0.5) return 'Decent hand';
      if (strength >= 0.3) return 'Marginal hand';
      return 'Weak hand';
    }
    const ev = bestHandFrom7(allCards);
    return ev ? ev.name : null;
  }

  _getActionsFor(playerId) {
    if (!['preflop', 'flop', 'turn', 'river'].includes(this.phase)) return [];
    if (this.bettingQueue[0] !== playerId) return [];
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.isComputer || player.status !== 'active') return [];

    const toCall = this.currentBet - player.streetBet;
    const actions = ['fold'];

    if (toCall === 0) {
      actions.push('check');
    } else {
      actions.push(`call ${toCall}`);
    }

    if (player.chips > toCall && player.chips >= this.minRaise) {
      actions.push('raise');
    }

    if (player.chips > 0) {
      actions.push('allin');
    }

    return actions;
  }
}

module.exports = Poker;
