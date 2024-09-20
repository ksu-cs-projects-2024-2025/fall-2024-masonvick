// backend/routes/tictactoe.js

const express = require('express');
const ticTacToeController = require('../controllers/tictactoeController');  // Ensure correct import of the controller
console.log('ticTacToeController:', ticTacToeController);  // Log the controller to check for functions
const { v4: uuidv4 } = require('uuid');  // Use uuid for unique ID generation
const sql = require('mssql');  // Ensure sql is properly imported for DB operations

// Initialize router
const router = express.Router();

// Route to get Tic Tac Toe stats for a specific user
router.get('/stats/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        // Fetch the user's game stats from the database
        const result = await sql.query`SELECT * FROM TicTacToeStats WHERE UserId = ${userId}`;
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error retrieving Tic Tac Toe stats:', err);
        res.status(500).json({ error: 'Failed to retrieve stats' });
    }
});

module.exports = (io) => {
    io.of('/tic-tac-toe').on('connection', (socket) => {
        console.log(`User connected to Tic-Tac-Toe with socket ID: ${socket.id}`);

        // Handle user identification
        socket.on('identify', (userId) => {
            socket.userId = userId;
            console.log(`User with Google ID ${userId} connected with socket ID: ${socket.id}`);
        });

        // Handle Quick Match requests
        socket.on('quickMatch', ({ gameType, userId }) => {
            console.log(`Quick match requested by ${userId} for ${gameType}`);

            // Call the quick match logic from the controller
            ticTacToeController.findMatch(io, socket, gameType, userId);

            // Listen for when the match is found and emit the game state
            socket.on('matchFound', ({ gameId, opponent }) => {
                console.log(`Match found for game ${gameId}. Emitting initial game state...`);

                // Make both players join the game room
                socket.join(gameId);  // Add the current player to the room
                const opponentSocket = io.sockets.sockets.get(opponent);  // Get the opponent's socket
                if (opponentSocket) {
                    opponentSocket.join(gameId);  // Add the opponent to the same room
                } else {
                    console.error(`Opponent's socket (${opponent}) not found.`);
                }

                // Emit the initial game state to both players
                ticTacToeController.emitGameState(io, gameId);
            });
        });

        // Handle players joining the game room
        socket.on('joinGame', ({ gameId }) => {
            ticTacToeController.joinGame(io, socket, gameId);  // Emit game state when a player joins
        });

        // Handle player moves (use the game logic inside the controller)
        socket.on('makeMove', (data) => {
            ticTacToeController.handleMove(io, socket, data);
        });

        // Handle resetting the game
        socket.on('resetGame', ({ gameId }) => {
            ticTacToeController.resetGame(io, socket, gameId);
        });

        // Handle rematch request
        socket.on('requestRematch', ({ gameId }) => {
            ticTacToeController.requestRematch(io, socket, gameId);
        });

        // Handle rematch acceptance
        socket.on('acceptRematch', ({ gameId }) => {
            ticTacToeController.acceptRematch(io, socket, gameId);
        });

        // Handle rematch decline
        socket.on('declineRematch', ({ gameId }) => {
            ticTacToeController.declineRematch(io, socket, gameId);
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User with socket ID: ${socket.id} disconnected.`);
        
            // Remove the player from the connectedPlayers map
            const userId = Object.keys(connectedPlayers).find(key => connectedPlayers[key] === socket.id);
            if (userId) {
                delete connectedPlayers[userId];
                console.log(`Removed ${userId} from connected players.`);
            }
        
            // Additional logic for handling disconnects can be added here
        });
    });

    return router;
};
