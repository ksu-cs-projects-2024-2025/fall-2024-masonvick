// backend/gameFactory.js

class TicTacToeGame {
    constructor() {
        this.board = Array(9).fill(null);
        this.currentPlayer = 'X';
        this.players = [];          // Add this line
        this.playerSymbols = {};    // Add this line
        this.winner = null;         // Add this line
        this.startTime = new Date();  // Store the time when the game starts
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

class LightbikesGame {
    constructor() {
        this.players = [];
        this.gameState = {
            grid: Array(100 * 100).fill(null),  // 100x100 grid for the game
            playerPositions: {},                // Store player positions
            gameOver: false,
            winner: null,
            moves: []                           // Store all moves
        };
        this.currentPlayer = null;
        this.startTime = new Date();            // Store the time when the game starts
    }

    initializeGameState() {
        return {
            grid: Array(75 * 75).fill(null),        // create grid
            players: [...this.players],             // Copy players to ensure immutability
            playerPositions: {},                    // Empty object to set positions separately
            gameOver: false,                        // Reset game over status
            winner: null,                           // Reset winner status
            moves: []                               // Fresh moves array
        };
    }
}

function createGame(gameType) {
    if (gameType === "tic-tac-toe") {
        return new TicTacToeGame();
    } else if (gameType === "lightbikes") {
        return new LightbikesGame();
    }
    throw new Error("Unsupported game type");
}

module.exports = { createGame };
