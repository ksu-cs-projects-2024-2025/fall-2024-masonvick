//backend/controllers/tictactoeController.js

const matchmakingManager = require('../matchmakingManager');
const sql = require('mssql');

const connectedPlayers = {};

// Handle user requests for Quick Match
exports.findMatch = (io, socket, gameType, userId) => {
    console.log(`Storing socket ID ${socket.id} for user ${userId}`);
    connectedPlayers[userId] = socket.id;  // Store the socket ID for the user

    const match = matchmakingManager.findMatch(gameType, userId);

    if (match) {
        const { gameId, opponent } = match;
        console.log(`Match found for user ${userId} in game ${gameId} with opponent ${opponent}`);

        // Get the game and player symbols
        const game = matchmakingManager.games[gameId];
        console.log('Retrieved game:', game); // Debug

        if (!game) {
            console.error(`Game with ID ${gameId} not found in matchmakingManager.games`);
            return;
        }

        const playerSymbols = game.playerSymbols;
        const playerSymbol = playerSymbols[userId];
        const opponentSymbol = playerSymbols[opponent];

        console.log('Player Symbol for user:', playerSymbol);

        // Get the opponent's socket ID from the connectedPlayers map
        const opponentSocketId = connectedPlayers[opponent];
        console.log(`Opponent's socket ID: ${opponentSocketId}`);

        if (opponentSocketId) {
            // Make both players join the game room
            socket.join(gameId);  // Current player (userId) joins the room
            const opponentSocket = io.of('/tic-tac-toe').sockets.get(opponentSocketId);  // Get the opponent's socket from the namespace
            if (opponentSocket) {
                console.log(`Adding opponent ${opponent} with socket ID ${opponentSocketId} to room ${gameId}`);
                opponentSocket.join(gameId);  // Add opponent to the same room

                // Notify both players that the match has been found
                socket.emit('matchFound', { gameId, opponent, symbol: playerSymbol });
                opponentSocket.emit('matchFound', { gameId, opponent: userId, symbol: opponentSymbol });

                // Emit the initial game state to both players
                exports.emitGameState(io, gameId);
            } else {
                console.error(`Opponent's socket (${opponentSocketId}) not found in the /tic-tac-toe namespace.`);
            }
        } else {
            console.error(`Opponent's socket ID for user ${opponent} not found in connectedPlayers.`);
        }
    } else {
        console.log(`User ${userId} is waiting for a match in ${gameType}`);
    }
};

// Handle player moves
exports.handleMove = (io, socket, { gameId, index }) => {
    const game = matchmakingManager.games[gameId];

    if (!game) {
        console.error(`Game with ID ${gameId} not found.`);
        return;
    }

    if (game.board[index] || game.winner) {
        console.log('Invalid move: cell already occupied or game already won.');
        return;  // Validate the move
    }

    const playerId = socket.userId;
    const playerSymbol = game.playerSymbols[playerId];

    if (!playerSymbol) {
        console.error(`Player ${playerId} is not part of game ${gameId}`);
        return;
    }

    if (playerSymbol !== game.currentPlayer) {
        console.log(`It's not player ${playerId}'s turn`);
        return;
    }

    console.log(`Player ${playerId} (${playerSymbol}) making a move at index ${index}`);

    // Update the game state with the move
    game.board[index] = game.currentPlayer;

    // Check for a winner after the move
    game.winner = checkWinner(game.board);

    // Log the updated board after the move
    console.log('Updated Game Board:', game.board);

    // Switch turns if there's no winner yet
    if (!game.winner) {
        game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
    }

    // Emit the updated game state to both players
    const updatedGameState = game.initializeGameState();
    io.of('/tic-tac-toe').to(gameId).emit('gameState', updatedGameState);

    // Log the game state emitted to players
    console.log('Game State Emitted:', updatedGameState);
};

// Emit the game state to all players in the room
exports.emitGameState = (io, gameId) => {
    const game = matchmakingManager.games[gameId];
    if (game) {
        console.log(`Emitting game state for game ${gameId}`);
        const gameState = game.initializeGameState();
        io.of('/tic-tac-toe').to(gameId).emit('gameState', gameState);  // Emit the initial state to all players in the room in the /tic-tac-toe namespace
    } else {
        console.error(`Game with ID ${gameId} not found.`);
    }
};

// Handle game reset
exports.resetGame = (io, socket, gameId) => {
    const game = matchmakingManager.games[gameId];
    if (!game) {
        console.error(`Game with ID ${gameId} not found.`);
        return;
    }

    game.board = Array(9).fill(null);
    game.currentPlayer = 'X';
    game.winner = null;

    const gameState = game.initializeGameState();
    io.of('/tic-tac-toe').to(gameId).emit('gameState', gameState);
};

// Handle rematch request (reset game button)
exports.requestRematch = (io, socket, gameId) => {
    const game = matchmakingManager.games[gameId];
    if (!game) {
        console.error(`Game with ID ${gameId} not found.`);
        return;
    }

    const playerId = socket.userId;
    const opponentId = game.players.find(id => id !== playerId);
    const opponentSocketId = connectedPlayers[opponentId];

    if (opponentSocketId) {
        const opponentSocket = io.of('/tic-tac-toe').sockets.get(opponentSocketId);
        if (opponentSocket) {
            console.log(`Sending rematch request from ${playerId} to ${opponentId}`);
            // Send rematch request to opponent
            opponentSocket.emit('rematchRequested');
        } else {
            console.error(`Opponent's socket (${opponentSocketId}) not found in the /tic-tac-toe namespace.`);
        }
    } else {
        console.error(`Opponent's socket ID for user ${opponentId} not found in connectedPlayers.`);
    }
};

// Handle rematch acceptance
exports.acceptRematch = (io, socket, gameId) => {
    const game = matchmakingManager.games[gameId];
    if (!game) {
        console.error(`Game with ID ${gameId} not found.`);
        return;
    }

    // Swap who goes first by swapping player symbols
    const [player1Id, player2Id] = game.players;
    const playerSymbols = game.playerSymbols;

    // Swap the symbols
    const tempSymbol = playerSymbols[player1Id];
    playerSymbols[player1Id] = playerSymbols[player2Id];
    playerSymbols[player2Id] = tempSymbol;

    game.playerSymbols = playerSymbols;

    // Reset game state
    game.board = Array(9).fill(null);
    game.winner = null;
    game.currentPlayer = 'X'; // Always start with 'X'

    console.log(`Rematch accepted. Players ${player1Id} and ${player2Id} have swapped symbols.`);

    // Notify both players that rematch was accepted
    io.of('/tic-tac-toe').to(gameId).emit('rematchAccepted');

    // Emit the new game state
    const gameState = game.initializeGameState();
    io.of('/tic-tac-toe').to(gameId).emit('gameState', gameState);
};

// Handle rematch decline
exports.declineRematch = (io, socket, gameId) => {
    const game = matchmakingManager.games[gameId];
    if (!game) {
        console.error(`Game with ID ${gameId} not found.`);
        return;
    }

    const playerId = socket.userId;
    const opponentId = game.players.find(id => id !== playerId);
    const opponentSocketId = connectedPlayers[opponentId];

    // Notify both players that rematch was declined
    socket.emit('rematchDeclined');
    if (opponentSocketId) {
        const opponentSocket = io.of('/tic-tac-toe').sockets.get(opponentSocketId);
        if (opponentSocket) {
            opponentSocket.emit('rematchDeclined');
        }
    }

    console.log(`Rematch declined by player ${playerId}`);
};

// Handle players joining the game room and emit the initial game state
exports.joinGame = (io, socket, gameId) => {
    const game = matchmakingManager.games[gameId];
    if (game) {
        console.log(`Player joined game ${gameId}`);
        socket.join(gameId);  // Ensure the socket joins the room

        // Emit the initial game state to the player who joined
        const gameState = game.initializeGameState();
        socket.emit('gameState', gameState);  // Emit directly to the socket
    } else {
        console.error(`Game with ID ${gameId} not found.`);
    }
};

// Function to store game stats in the database
async function storeGameStats(userId, win, moves) {
    try {
        await sql.query`INSERT INTO TicTacToeStats (UserId, Win, Moves) VALUES (${userId}, ${win}, ${moves})`;
        console.log('Tic Tac Toe stats recorded successfully');
    } catch (err) {
        console.error('Error inserting Tic Tac Toe stats:', err);
    }
}

// Function to check for a winner (can be extended or imported)
function checkWinner(board) {
    const winningCombinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    for (let [a, b, c] of winningCombinations) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];  // Return the winner ('X' or 'O')
        }
    }
    return null;
}
