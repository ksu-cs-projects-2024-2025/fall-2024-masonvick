// backend/matchmakingManager.js

const { createGame } = require('./gameFactory');

const games = {};
const waitingPlayers = {};

const waitingRankedPlayers = {
    'tic-tac-toe': [],
    'lightbikes': []
};

const generateGameId = () => Math.random().toString(36).substr(2, 9);


// Join tic tac toe game
const joinGame = (gameId, playerId) => {
    const game = games[gameId];
    if (game && game.players.length < 2) {
        game.players.push(playerId);
        console.log(`Player ${playerId} joined game ${gameId}. Players: ${game.players}`);
        return game;
    }
    console.error(`Failed to join game ${gameId}. Either it doesn't exist or it's full.`);
    return null;
};

// Tic Tac Toe quickmatch
const findTicTacToeMatch = (io, playerId, connectedPlayers) => {
    console.log(`Looking for a Tic-Tac-Toe match for player ${playerId}`);

    if (!waitingPlayers['tic-tac-toe']) {
        waitingPlayers['tic-tac-toe'] = [];
    }

    const opponent = waitingPlayers['tic-tac-toe'].find(id => id !== playerId);

    if (opponent) {
        console.log(`Found opponent: ${opponent} for player ${playerId}`);

        waitingPlayers['tic-tac-toe'] = waitingPlayers['tic-tac-toe'].filter(id => id !== opponent);

        const gameId = generateGameId();
        const game = createGame('tic-tac-toe');
        game.players = [playerId, opponent];
        games[gameId] = game;

        // Fetch socket IDs for both players from `connectedPlayers`
        const playerSocket = connectedPlayers[playerId];   // Use connectedPlayers
        const opponentSocket = connectedPlayers[opponent]; // Use connectedPlayers

        if (playerSocket && opponentSocket) {
            console.log(`returning from findTicTacToeMatch to player ${playerId} and opponent ${opponent}`);
            return { gameId, opponent };
        } else {
            console.error('Socket ID missing for one or both players:', { playerSocket, opponentSocket });
        }
    } else {
        // No match found, add the player to the queue
        console.log(`No opponent found. Adding player ${playerId} to the queue.`);
        waitingPlayers['tic-tac-toe'].push(playerId);
        return null;
    }
};

const joinLightbikesGame = (gameId, playerId) => {
    const game = games[gameId];
    
    if (game && game.players.length < 2) {
        game.players.push(playerId);
        console.log(`Player ${playerId} joined Lightbikes game ${gameId}. Players: ${game.players}`);
        return game;
    }
    console.error(`Failed to join Lightbikes game ${gameId}. Either it doesn't exist or it's full.`);
    return null;
};


// Lightbikes matchmaking (quickmatch)
const findLightbikesMatch = (io, playerId, connectedPlayers) => {
    console.log(`Looking for a Lightbikes match for player ${playerId}`);

    if (!waitingPlayers['lightbikes']) {
        waitingPlayers['lightbikes'] = [];
    }

    waitingPlayers['lightbikes'].push(playerId);

    if (waitingPlayers['lightbikes'].length > 1) {
        console.log(`Found player for the game`);

        // Create the game and remove the first two players from the queue
        const gameId = generateGameId();
        const game = createGame('lightbikes');

        // Take first two players from queue
        const player1 = waitingPlayers['lightbikes'].shift();
        const player2 = waitingPlayers['lightbikes'].shift();
        game.players = [player1, player2];

        games[gameId] = game;

        // Initialize the game state right away
        game.gameState = game.initializeGameState();
        game.gameState.playerPositions = {};  // Ensure this is initialized

        // Return the game info - actual notification will happen in findMatch
        return { 
            gameId, 
            players: game.players 
        };
    } else {
        console.log(`Not enough players yet. Player ${playerId} added to the queue.`);
        return null;
    }
};

function findRankedMatch(gameType, playerId, playerRating, connectedPlayers) {
    console.log(`Looking for a ranked ${gameType} match for player ${playerId} with rating ${playerRating}`);

    // Ensure we have a queue array for this game type
    if (!waitingRankedPlayers[gameType]) {
        waitingRankedPlayers[gameType] = [];
    }

    // Add the player to the ranked waiting queue
    waitingRankedPlayers[gameType].push({
        userId: playerId,
        skillRating: playerRating,
        timestamp: Date.now()
    });

    // Sort players by skill rating (ascending)
    waitingRankedPlayers[gameType].sort((a, b) => a.skillRating - b.skillRating);

    // Find the index of the current player in the queue
    const playerIndex = waitingRankedPlayers[gameType].findIndex(p => p.userId === playerId);

    let bestMatch = null;
    let bestDifference = Infinity;

    // Attempt to find the closest skill-rated match
    for (let i = 0; i < waitingRankedPlayers[gameType].length; i++) {
        if (i === playerIndex) continue; // Skip the player themselves

        const other = waitingRankedPlayers[gameType][i];
        const diff = Math.abs(other.skillRating - playerRating);

        if (diff < bestDifference) {
            bestDifference = diff;
            bestMatch = other;
        }
    }

    if (bestMatch) {
        // Found a suitable match
        // Remove both players from the queue
        waitingRankedPlayers[gameType] = waitingRankedPlayers[gameType].filter(p =>
            p.userId !== playerId && p.userId !== bestMatch.userId
        );

        // Create a game session
        const gameId = generateGameId();
        const game = createGame(gameType);
        game.players = [playerId, bestMatch.userId];
        games[gameId] = game;

        console.log(`Ranked match found: ${playerId} vs ${bestMatch.userId} in ${gameType}, gameId: ${gameId}`);
        return { gameId, players: game.players };
    } else {
        // No suitable close match found yet
        // Check if only 2 players are in the queue. If so, force a match.
        if (waitingRankedPlayers[gameType].length === 2) {
            const [p1, p2] = waitingRankedPlayers[gameType];
            if (p1 && p2) {
                // Force these two players to match
                waitingRankedPlayers[gameType] = [];

                const gameId = generateGameId();
                const game = createGame(gameType);
                game.players = [p1.userId, p2.userId];
                games[gameId] = game;

                console.log(`Forced ranked match due to only two players waiting: ${p1.userId} vs ${p2.userId}, gameId: ${gameId}`);
                return { gameId, players: game.players };
            }
        }

        // If no match found and not forced, return null
        // The caller (controller) should check if this returned null.
        return null;
    }
}

// Create a new game session (play via code)
const createGameSession = (gameType, playerId) => {
    const gameId = generateGameId(); // Generate unique game ID
    const game = createGame(gameType); // Create a new game instance
    game.players = []; // Ensure players array is initialized
    game.players.push(playerId); // Add the creating player
    games[gameId] = game; // Store the entire game instance
    console.log(`Game session created with ID: ${gameId} by player ${playerId}`);
    return gameId;
};


module.exports = {
    createGameSession,
    findLightbikesMatch,
    joinGame,
    joinLightbikesGame,
    findTicTacToeMatch,
    findRankedMatch,
    games
};
