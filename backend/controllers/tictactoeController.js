//backend/controllers/tictactoeController.js

const matchmakingManager = require('../matchmakingManager');
const sql = require('mssql');
const { getPlayerSkillRating } = require('../utils');

//dict to store connected players
// [userId: socketId]
const connectedPlayers = {};

// Handle user requests for Quick Match
exports.findMatch = (io, socket, gameType, userId) => {
    //console.log(`Looking for a match for player ${userId} in game type ${gameType}`);

    // store the socket id in connectedPlayers
    connectedPlayers[userId] = socket.id;

    // Call matchmaking logic from matchmakingManager
    const match = matchmakingManager.findTicTacToeMatch(io, userId, connectedPlayers); 

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
            socket.broadcast.to(gameId).emit('matchFound', { gameId, opponent: userId, symbol: 'O' });

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

    // Update the game state with the move first
    game.board[index] = game.currentPlayer;

    // Check for a winner
    game.winner = checkWinner(game.board);

    // Log the updated board
    //console.log('Updated Game Board:', game.board);

    // Switch turns if there's no winner
    if (!game.winner) {
        game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
    }

    // Emit updated game state to both players
    const updatedGameState = game.getGameState();
    io.of('/tic-tac-toe').to(gameId).emit('gameState', updatedGameState);

    // Log the game state emitted to players
    //console.log('Game State Emitted:', updatedGameState);

    // If the game has a winner or is a draw, save the game to the database
    if (game.winner || !game.board.includes(null)) {
        const moves = game.board.map((move, idx) => move === null ? "" : move).join(',');
        const winnerId = game.winner ? (game.winner === game.playerSymbols[game.players[0]] ? game.players[0] : game.players[1]) : null;
        const player1Id = game.players[0];  // get userId of player 1
        const player2Id = game.players[1];  // get userId of player 2
        const startTime = game.startTime;
        const endTime = new Date();  // Current time when the game ends
        
        // Store the game in the database
        await storeGameInDB(player1Id, player2Id, winnerId, game.playerSymbols[game.players[0]], game.playerSymbols[game.players[1]], moves, startTime, endTime);
        // Reset the game board and emit the reset state
        delete matchmakingManager.games[gameId];  // Add this line
    }
};

// Define the startGame function
exports.startGame = (io, gameId) => {
    const game = matchmakingManager.games[gameId];
    if (!game) {
        console.error(`Game with ID ${gameId} not found`);
        return;
    }

    // Initialize game state and players
    //game.board = Array(9).fill(null);  // Tic-Tac-Toe has 9 cells
    //game.currentPlayer = 'X';  // 'X' always starts first
    //game.winner = null;

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
        io.of('/tic-tac-toe').to(gameId).emit('gameState', game.getGameState());  // Emit the initial state to all players in the room in the /tic-tac-toe namespace
    } else {
        console.error(`Game with ID ${gameId} not found.`);
    }
};

exports.findRankedMatch = (io, socket, gameType, userId, skillRating) => {
    console.log(`Looking for a ranked Tic-Tac-Toe match for user ${userId} with rating ${skillRating}`);

    // Store the player's socket ID
    connectedPlayers[userId] = socket.id;

    const match = matchmakingManager.findRankedMatch(gameType, userId, skillRating, connectedPlayers);

    // If no match found, just return
    if (!match) {
        console.log(`User ${userId} with rating ${skillRating} is waiting for a ranked Tic-Tac-Toe match.`);
        return;
    }

    const { gameId, players } = match;

    // The first player in the array is 'X', the second is 'O'
    const playerX = players[0];
    const playerO = players[1];

    // Now send `matchFound` with the symbol to each player
    const playerXSocket = io.of('/tic-tac-toe').sockets.get(connectedPlayers[playerX]);
    const playerOSocket = io.of('/tic-tac-toe').sockets.get(connectedPlayers[playerO]);

    if (playerXSocket) {
        playerXSocket.join(gameId);
        playerXSocket.gameId = gameId;
        console.log(`Player ${playerX} joined ranked room ${gameId}`);
        playerXSocket.emit('matchFound', { gameId, opponent: playerO, symbol: 'X' });
    } else {
        console.error(`Socket not found for ranked player ${playerX}`);
    }

    if (playerOSocket) {
        playerOSocket.join(gameId);
        playerOSocket.gameId = gameId;
        console.log(`Player ${playerO} joined ranked room ${gameId}`);
        playerOSocket.emit('matchFound', { gameId, opponent: playerX, symbol: 'O' });
    } else {
        console.error(`Socket not found for ranked player ${playerO}`);
    }

    // Start the Tic Tac Toe game
    exports.startGame(io, gameId);
};



// Handle game forfeiture when a player disconnects or leaves the game
exports.forfeitGame = (io, userId) => {
    //const game = matchmakingManager.findGameByPlayer(userId, 'tic-tac-toe');
    if (!game) {
        console.log(`No game found for user ${userId} to forfeit.`);
        return;
    }

    const opponentId = game.players.find(id => id !== userId);
    game.winner = opponentId;  // Set the opponent as the winner

    console.log(`Player ${userId} forfeited. Opponent ${opponentId} wins the game.`);

    // Emit game state showing that the opponent won
    const updatedGameState = game.getGameState();
    io.of('/tic-tac-toe').to(game.id).emit('gameState', updatedGameState);

    // You may also want to store the game result in the database
    storeGameInDB(game.players[0], game.players[1], game.winner, game.playerSymbols[game.players[0]], game.playerSymbols[game.players[1]], game.board.join(','), game.startTime, new Date());
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


//
//
// Section for games via codes
//
//

exports.createGame = (io, socket, gameType, userId) => {
    try {
        // Step 1: Generate a new game session
        const gameId = matchmakingManager.createGameSession(gameType, userId);
        const game = matchmakingManager.games[gameId];

        if (!game) {
            console.error(`Failed to create game session for user ${userId}.`);
            return null;
        }

        // Step 2: Initialize game state
        game.players = [userId]; // Add the creating player
        game.playerSymbols[userId] = 'X'; // Assign 'X' to the creator
        game.currentPlayer = 'X'; // 'X' always starts

        console.log(`Game created with ID: ${gameId} by user ${userId}`);
        
        // Map the creator's userId to their socket ID (if not already done)
        connectedPlayers[userId] = socket.id;

        // Step 3: Notify the creator of the game
        socket.emit('gameCreated', { gameId });
        
        return gameId;
    } catch (error) {
        console.error('Error creating game:', error);
        socket.emit('error', { message: 'Failed to create game. Please try again.' });
        return null;
    }
};

exports.joinGameByCode = (io, socket, gameId, userId) => {
    const game = matchmakingManager.joinGame(gameId, userId);
    if (!game) {
        console.error(`Game with ID ${gameId} not found or is full.`);
        return false;
    }

    console.log(`Game found with ID: ${gameId}. Pairing players: ${game.players.join(', ')}`);

    // Add both players to the game room
    game.players.forEach((playerId) => {
        const playerSocketId = playerId === userId ? socket.id : connectedPlayers[playerId];
        const playerSocket = io.of('/tic-tac-toe').sockets.get(playerSocketId);
        if (playerSocket) {
            playerSocket.join(gameId);
        } else {
            console.error(`Socket not found for player ${playerId}`);
        }
    });

    // Notify both players
    const [player1, player2] = game.players;
    const player1Symbol = 'X';
    const player2Symbol = 'O';

    //socket.emit('matchFound', { gameId, opponent: player2, symbol: player1Symbol });
    //socket.broadcast.to(gameId).emit('matchFound', { gameId, opponent: player1, symbol: player2Symbol });

    socket.emit('matchFound', { 
        gameId, 
        opponent: game.players.find(id => id !== userId), 
        symbol: game.playerSymbols[userId] 
    });
    
    socket.broadcast.to(gameId).emit('matchFound', { 
        gameId, 
        opponent: userId, 
        symbol: game.playerSymbols[game.players.find(id => id !== userId)] 
    });

    // Emit the initial game state
    exports.emitGameState(io, gameId);
    return true;
};



// Following code is for enabling a rematch option, but not used for now

/*
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

    const gameState = game.getGameState();
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
    const gameState = game.getGameState();
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

*/
