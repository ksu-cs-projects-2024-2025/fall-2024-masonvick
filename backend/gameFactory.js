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
            grid: Array(75 * 75).fill(null),      // Create a fresh 100x100 grid for each game
            players: [...this.players],             // Copy players to ensure immutability
            playerPositions: {},                    // Empty object to set positions separately
            gameOver: false,                        // Reset game over status
            winner: null,                           // Reset winner status
            moves: []                               // Fresh moves array
        };
    }
}


class WordleGame {
    constructor() {
        this.players = [];
        this.gameState = {
            grid: Array(6).fill('').map(() => Array(5).fill('')), // 6 rows for guesses, 5 columns for letters
            currentGuesses: ['', ''], // For tracking each player’s current guesses
            gameOver: false,
            winner: null,
            moves: [], // To log all moves
        };
        this.startTime = new Date();
    }

    initializeGameState() {
        return {
            grid: this.gameState.grid.map(row => [...row]), // Clone grid
            players: [...this.players], // Clone players array
            currentGuesses: [...this.gameState.currentGuesses],
            gameOver: this.gameState.gameOver,
            winner: this.gameState.winner,
            moves: [...this.gameState.moves],
        };
    }
}

function createGame(gameType) {
    if (gameType === "tic-tac-toe") {
        return new TicTacToeGame();
    } else if (gameType === "battleship") {
        return new BattleshipGame();
    } else if (gameType === "lightbikes") {
        return new LightbikesGame();
    }
    else if (gameType === "wordle") {
        return new WordleGame();
    }
    throw new Error("Unsupported game type");
}

module.exports = { createGame };
