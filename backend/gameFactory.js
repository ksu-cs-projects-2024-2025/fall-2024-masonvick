// backend/gameFactory.js

class TicTacToeGame {
    constructor() {
        this.board = Array(9).fill(null); // 3x3 board
        this.currentPlayer = 'X';         // 'X' goes first
        this.players = [];                // player IDs
        this.playerSymbols = {};          //Maps players to X or O
        this.winner = null;               // 'X' or 'O'
        this.startTime = new Date();      // time when game starts
    }

    getGameState() {
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
            playerPositions: {},                
            gameOver: false,
            winner: null,
        };
        this.currentPlayer = null;
        this.startTime = new Date();            // Store the time when the game starts
    }

    initializeGameState() {
        const grid = Array(100 * 100).fill(null);  // Create a fresh grid
        const playerPositions = {};

        // Initialize each player's position, trail length, and steers
        this.players.forEach(playerId => {
            playerPositions[playerId] = {
                x: 0,                            // Initial x position (will be updated when game starts)
                y: 0,                            // Initial y position (will be updated when game starts)
                direction: null,                 // Will be set to an initial random direction
                trail: [],                       // Empty trail for new game
                trailLength: 0,                  // Start with a trail length of 0
                steers: []                       // Start with an empty array of steers
            };
        });

        return {
            grid, 
            players: [...this.players],             // Copy players to ensure immutability
            playerPositions,
            gameOver: false,                        
            winner: null,
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
