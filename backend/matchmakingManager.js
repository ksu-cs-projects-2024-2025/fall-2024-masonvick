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


// Lightbikes matchmaking (quickmatch)
const findLightbikesMatch = (io, playerId, connectedPlayers) => {
    console.log(`Looking for a Lightbikes match for player ${playerId}`);

    if (!waitingPlayers['lightbikes']) {
        waitingPlayers['lightbikes'] = [];
    }

    waitingPlayers['lightbikes'].push(playerId);

    if (waitingPlayers['lightbikes'].length > 1) {
        console.log(`Found player for the game`);

        // Create the game and remove the first `playerLimit` players from the queue
        const gameId = generateGameId();
        const game = createGame('lightbikes');
        game.players = [];

        while (waitingPlayers['lightbikes'].length > 0) {
            const player = waitingPlayers['lightbikes'].shift();
            game.players.push(player);
        }

        games[gameId] = game;

        // Notify all players that the match is found and ready
        game.players.forEach(playerId => {
            const playerSocket = connectedPlayers[playerId];
            if (playerSocket) {
                io.of('/lightbikes').to(playerSocket).emit('matchFound', { gameId, players: game.players });
            }
        });

        return { gameId, players: game.players };
    } else {
        console.log(`Not enough players yet. Player ${playerId} added to the queue.`);
        return null;
    }
};


// Tic Tac Toe matchmaking (quickmatch)
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
            console.log(`Emitting matchFound to player ${playerId} and opponent ${opponent}`);

            // Emit match found events to both players using their socket IDs
            io.of('/tic-tac-toe').to(playerSocket).emit('matchFound', { gameId, opponent });
            io.of('/tic-tac-toe').to(opponentSocket).emit('matchFound', { gameId, opponent: playerId });

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


const findWordleMatch = (userId) => {
    if (wordleQueue.length > 0) {
        return wordleQueue.shift();  // Pair with a waiting player
    } else {
        wordleQueue.push(userId);  // Add player to queue
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
    findLightbikesMatch,
    joinGame,
    findTicTacToeMatch,
    games
};
