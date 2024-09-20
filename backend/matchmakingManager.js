// backend/gameFactory.js

class TicTacToeGame {
    constructor() {
        this.board = Array(9).fill(null);
        this.currentPlayer = 'X';
        this.players = [];          // Add this line
        this.playerSymbols = {};    // Add this line
        this.winner = null;         // Add this line
    }

    initializeGameState() {
        return {
            board: this.board,
            currentPlayer: this.currentPlayer,
            winner: this.winner,
            players: this.players,              // These will be set after initialization
            playerSymbols: this.playerSymbols   // These will be set after initialization
        };
    }
}

class BattleshipGame {
    constructor() {
        this.board = []; // Initialize differently for Battleship
        // Populate board with ships, etc.
    }

    initializeGameState() {
        return {
            board: this.board, // Likely will be more complex
            currentPlayer: 'Player 1',
            winner: null,
            players: [],
            phase: 'setup' // Different phases like 'setup' and 'battle'
        };
    }
}

function createGame(gameType) {
    if (gameType === "tic-tac-toe") {
        return new TicTacToeGame();
    } else if (gameType === "battleship") {
        return new BattleshipGame();
    }
    throw new Error("Unsupported game type");
}

module.exports = { createGame };
