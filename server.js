const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static(__dirname));

let turnTimer = null;
let timeRemaining = 20;

let gameState = {
    players: {}, 
    deck: [],
    dealer: { cards: [] },
    dealerScore: 0,
    activeSeat: 0,
    status: "BETTING",
    hideDealerCard: true,
    message: "Welcome! Claim a seat to place your bets."
};

const suits = [{ symbol: '♠', isRed: false }, { symbol: '♥', isRed: true }, { symbol: '♦', isRed: true }, { symbol: '♣', isRed: false }];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createMultiDeck() {
    gameState.deck = [];
    for (let d = 0; d < 6; d++) {
        for (let suit of suits) {
            for (let rank of ranks) {
                let value = parseInt(rank);
                if (['J', 'Q', 'K'].includes(rank)) value = 10;
                if (rank === 'A') value = 11;
                gameState.deck.push({ suit, rank, value });
            }
        }
    }
    for (let i = gameState.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameState.deck[i], gameState.deck[j]] = [gameState.deck[j], gameState.deck[i]];
    }
}

function calculateScore(cards) {
    let total = 0, aces = 0;
    for (let c of cards) { total += c.value; if (c.rank === 'A') aces++; }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}

function startTurnTimer() {
    clearInterval(turnTimer);
    timeRemaining = 20;
    turnTimer = setInterval(() => {
        timeRemaining--;
        let p = Object.values(gameState.players).find(pl => pl.seat === gameState.activeSeat);
        if (p) {
            gameState.message = `👉 ${p.name}'s Turn! [${timeRemaining}s remaining]`;
            io.emit('table-updated', gameState);
        }
        if (timeRemaining <= 0) {
            clearInterval(turnTimer);
            if (p) {
                p.stood = true;
                gameState.message = `⏰ ${p.name} ran out of time! Forced Stand.`;
                moveToNextPlayer();
            }
        }
    }, 1000);
}

function moveToNextPlayer() {
    let seats = Object.values(gameState.players).sort((a,b) => a.seat - b.seat);
    let currentActive = seats.find(p => p.seat >= gameState.activeSeat && !p.busted && !p.stood);

    if (currentActive) {
        gameState.activeSeat = currentActive.seat;
        startTurnTimer();
    } else {
        clearInterval(turnTimer);
        executeDealerTurn();
    }
}

function executeDealerTurn() {
    gameState.hideDealerCard = false;
    gameState.dealerScore = calculateScore(gameState.dealer.cards);
    if (gameState.dealerScore >= 17) { resolveBetsAndPayouts(); return; }
    dealNextDealerCard();
}

function dealNextDealerCard() {
    gameState.dealerScore = calculateScore(gameState.dealer.cards);
    if (gameState.dealerScore >= 17) { resolveBetsAndPayouts(); return; }
    gameState.dealer.cards.push(gameState.deck.pop());
    io.emit('table-updated', gameState);
    setTimeout(dealNextDealerCard, 800);
}

function resolveBetsAndPayouts() {
    let dScore = calculateScore(gameState.dealer.cards);
    Object.values(gameState.players).forEach(p => {
        let pScore = calculateScore(p.cards);
        if (p.busted) p.bet = 0;
        else if (dScore > 21 || pScore > dScore) { p.bank += p.bet * 2; p.bet = 0; }
        else if (pScore < dScore) p.bet = 0;
        else { p.bank += p.bet; p.bet = 0; }
    });
    gameState.status = "BETTING";
    gameState.message = "🏁 Round Complete! Place bets to play the next hand.";
    io.emit('table-updated', gameState);
}

io.on('connection', (socket) => {
    socket.emit('table-updated', gameState);

    socket.on('send-chat', (msg) => {
        let name = gameState.players[socket.id] ? gameState.players[socket.id].name : "Guest";
        io.emit('receive-chat', { user: name, message: msg });
    });

    socket.on('join-table', (playerName) => {
        let assignedSeat = -1;
        for (let i = 0; i < 6; i++) {
            if (!Object.values(gameState.players).some(p => p.seat === i)) { assignedSeat = i; break; }
        }
        if (assignedSeat !== -1 && gameState.status === "BETTING") {
            gameState.players[socket.id] = {
                id: socket.id, name: playerName, seat: assignedSeat,
                bank: 500, bet: 0, cards: [], score: 0, busted: false, stood: false
            };
            socket.emit('seat-assigned', assignedSeat);
            io.emit('table-updated', gameState);
        } else {
            socket.emit('table-full', 'Table full or hand in progress.');
        }
    });

    socket.on('place-bet', (amt) => {
        let p = gameState.players[socket.id];
        if (!p || gameState.status !== "BETTING") return;
        if (amt === 'all') { p.bet += p.bank; p.bank = 0; }
        else if (p.bank >= amt) { p.bank -= amt; p.bet += amt; }
        io.emit('table-updated', gameState);
    });

    socket.on('request-deal', () => {
        let activePlayers = Object.values(gameState.players);
        if (activePlayers.length === 0) return;
        activePlayers.forEach(p => { if (p.bet === 0 && p.bank >= 10) { p.bank -= 10; p.bet = 10; } });
        gameState.status = "PLAYING";
        gameState.hideDealerCard = true;
        createMultiDeck();
        activePlayers.forEach(p => {
            p.cards = [gameState.deck.pop(), gameState.deck.pop()];
            p.score = calculateScore(p.cards);
            p.busted = false; p.stood = false;
        });
        gameState.dealer.cards = [gameState.deck.pop(), gameState.deck.pop()];
        let sorted = activePlayers.sort((a,b) => a.seat - b.seat);
        gameState.activeSeat = sorted[0].seat;
        moveToNextPlayer();
    });

    socket.on('player-action', (action) => {
        let p = gameState.players[socket.id];
        if (!p || gameState.status !== "PLAYING" || p.seat !== gameState.activeSeat) return;
        
        if (action === 'hit') {
            p.cards.push(gameState.deck.pop()); 
            p.score = calculateScore(p.cards);
            if (p.score >= 21) { 
                if (p.score > 21) p.busted = true; else p.stood = true; 
                moveToNextPlayer(); 
            } else { 
                // Timer resets back to 20s right here when clicking hit!
                startTurnTimer(); 
                io.emit('table-updated', gameState); 
            }
        } else if (action === 'stand') {
            p.stood = true; 
            moveToNextPlayer();
        } else if (action === 'double') {
            if (p.bank >= p.bet) {
                p.bank -= p.bet; p.bet = p.bet * 2; p.cards.push(gameState.deck.pop());
                p.score = calculateScore(p.cards); if (p.score > 21) p.busted = true; else p.stood = true;
                moveToNextPlayer();
            }
        }
    });

    socket.on('disconnect', () => {
        if (gameState.players[socket.id]) {
            let leftSeat = gameState.players[socket.id].seat;
            delete gameState.players[socket.id];
            if (Object.keys(gameState.players).length === 0) { gameState.status = "BETTING"; clearInterval(turnTimer); }
            else if (gameState.status === "PLAYING" && gameState.activeSeat === leftSeat) { moveToNextPlayer(); }
            io.emit('table-updated', gameState);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server executing live on Port ${PORT}`));
