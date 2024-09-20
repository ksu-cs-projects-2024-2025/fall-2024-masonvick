// backend/matchmakingManager.js

const { createGame } = require('./gameFactory');

const games = {};
const waitingPlayers = {};

const generateGameId = () => Math.random().toString(36).substr(2, 9);


// Join an existing game by gameId and playerId
const joinGame = (gameId, playerId) => {
    const game = games[gameId];
    if (game && game.players.length < 2) {
        game.players.push(playerId);
        return true;
    }
    return false;
};

// Function to find a match or add player to queue
const findMatch = (gameType, playerId) => {
    console.log(`Looking for a match for session ${playerId} in game type ${gameType}`);
    
    // Initialize the queue for this game type if it doesn't exist
    if (!waitingPlayers[gameType]) {
        waitingPlayers[gameType] = [];
    }

    // Try to find an opponent who is not the current player
    const opponent = waitingPlayers[gameType].find(id => id !== playerId);

    if (opponent) {
        // Remove the opponent from the queue
        waitingPlayers[gameType] = waitingPlayers[gameType].filter(id => id !== opponent);
        console.log(`Match found between ${playerId} and ${opponent}`);

        // Create a new game session
        const gameId = generateGameId();
        const game = createGame(gameType);

        // Set the players on the game instance
        game.players = [playerId, opponent];

        // Randomly assign 'X' and 'O' to the players
        const symbols = ['X', 'O'];
        const randomIndex = Math.floor(Math.random() * 2);
        game.playerSymbols = {
            [playerId]: symbols[randomIndex],
            [opponent]: symbols[1 - randomIndex]
        };

        // Store the original player symbols to alternate in rematches
        game.originalPlayerSymbols = { ...game.playerSymbols };

        // Store the game instance directly in the games object
        games[gameId] = game;

        console.log('Game State after setting players and symbols:', game);

        // Return match details
        return { gameId, opponent };
    } else {
        // No match found, add this player to the queue
        waitingPlayers[gameType].push(playerId);
        console.log(`No match found, adding player ${playerId} to the queue.`);
        return null;
    }
};

// Create a new game session
const createGameSession = (gameType) => {
    const gameId = Math.random().toString(36).substr(2, 9);  // Random game ID
    const game = createGame(gameType);
    games[gameId] = game.initializeGameState();
    return gameId;
};


module.exports = {
    createGameSession,
    joinGame,
    findMatch,
    games
};
