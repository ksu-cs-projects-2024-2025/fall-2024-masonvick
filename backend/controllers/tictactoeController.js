//backend/controllers/tictactoeController.js

const matchmakingManager = require('../matchmakingManager');
const sql = require('mssql');

const connectedPlayers = {};

// Handle user requests for Quick Match
exports.findMatch = (io, socket, gameType, userId) => {
    console.log(`Looking for a match for player ${userId} in game type ${gameType}`);

    // Track the user's socket ID to ensure it's available for matchmaking
    connectedPlayers[userId] = socket.id;

    // Call matchmaking logic from matchmakingManager
    const match = matchmakingManager.findTicTacToeMatch(io, userId, connectedPlayers);  // Use centralized logic

    if (match) {
        const { gameId, opponent } = match;
        const opponentSocketId = connectedPlayers[opponent];
        const opponentSocket = io.of('/tic-tac-toe').sockets.get(opponentSocketId);

        if (opponentSocket) {
            // Add both players to the same game room
            socket.join(gameId);
            opponentSocket.join(gameId);

            // Notify both players that a match has been found
            socket.emit('matchFound', { gameId, opponent, symbol: 'X'  });
            opponentSocket.emit('matchFound', { gameId, opponent: userId, symbol: 'O' });

            // Start the game once the match is found
            exports.startGame(io, gameId);
        } else {
            console.error(`Opponent socket not found for user ${opponent}.`);
        }
    } else {
        console.log(`User ${userId} is waiting for a match in ${gameType}`);
        // No match found yet, player will wait in the matchmaking queue
    }
};


// Handle player moves
exports.handleMove = async (io, socket, { gameId, index }) => {
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

    // If the game has a winner or is a draw, save the game to the database
    if (game.winner || !game.board.includes(null)) {
        const moves = game.board.map((move, idx) => move === null ? "" : move).join(',');
        const winnerId = game.winner ? (game.winner === game.playerSymbols[game.players[0]] ? game.players[0] : game.players[1]) : null;
        const player1Id = game.players[0];  // Use userId from the Users table
        const player2Id = game.players[1];
        const startTime = game.startTime;  // Assuming you set this when the game starts
        const endTime = new Date();  // Current time when the game ends

        // Store the game in the database using Google IDs to lookup internal IDs
        await storeGameInDB(player1Id, player2Id, winnerId, game.playerSymbols[game.players[0]], game.playerSymbols[game.players[1]], moves, startTime, endTime);
    }
};

// Function to store game data in the database
async function storeGameInDB(player1Id, player2Id, winnerId, player1Symbol, player2Symbol, moves, startTime, endTime) {
    try {
        if (!player1Id || !player2Id) {
            throw new Error('Could not retrieve one or both player IDs');
        }

        // Insert the game into the TicTacToeGames table
        console.log('Data to insert:', { player1Id, player2Id, winnerId, player1Symbol, player2Symbol, moves, startTime, endTime });
        await sql.query`INSERT INTO TicTacToeGames (Player1Id, Player2Id, WinnerId, Player1Symbol, Player2Symbol, Moves, StartTime, EndTime)
                        VALUES (${player1Id}, ${player2Id}, ${winnerId}, ${player1Symbol}, ${player2Symbol}, ${moves}, ${startTime}, ${endTime})`;
        console.log('Game successfully stored in the database');
    } catch (err) {
        console.error('Error inserting game data into the database:', err);
    }
}

// Define the startGame function
exports.startGame = (io, gameId) => {
    const game = matchmakingManager.games[gameId];
    if (!game) {
        console.error(`Game with ID ${gameId} not found`);
        return;
    }

    // Initialize game state and players
    game.board = Array(9).fill(null);  // Tic-Tac-Toe has 9 cells
    game.currentPlayer = 'X';  // 'X' always starts first
    game.winner = null;

    // Assign symbols to players
    game.playerSymbols = {
        [game.players[0]]: 'X',  // First player gets 'X'
        [game.players[1]]: 'O'   // Second player gets 'O'
    };

    console.log(`Starting Tic-Tac-Toe game ${gameId} with players:`, game.players);

    // Emit the initial game state to all players in the room
    exports.emitGameState(io, gameId);
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

// Handle game forfeiture when a player disconnects or leaves the game
exports.forfeitGame = (io, userId) => {
    const game = matchmakingManager.findGameByPlayer(userId, 'tic-tac-toe');
    if (!game) {
        console.log(`No game found for user ${userId} to forfeit.`);
        return;
    }

    const opponentId = game.players.find(id => id !== userId);
    game.winner = opponentId;  // Set the opponent as the winner

    console.log(`Player ${userId} forfeited. Opponent ${opponentId} wins the game.`);

    // Emit game state showing that the opponent won
    const updatedGameState = game.initializeGameState();
    io.of('/tic-tac-toe').to(game.id).emit('gameState', updatedGameState);

    // You may also want to store the game result in the database
    storeGameInDB(game.players[0], game.players[1], game.winner, game.playerSymbols[game.players[0]], game.playerSymbols[game.players[1]], game.board.join(','), game.startTime, new Date());
};

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
