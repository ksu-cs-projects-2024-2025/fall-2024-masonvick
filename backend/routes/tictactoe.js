// backend/routes/tictactoe.js

const express = require('express');
const ticTacToeController = require('../controllers/tictactoeController'); // import ttt controller
const matchmakingManager = require('../matchmakingManager'); //import mmManager
const { getPlayerSkillRating } = require('../utils');
//console.log('ticTacToeController:', ticTacToeController);  // logs controller and its functions
const sql = require('mssql');  // Ensure sql is properly imported for DB operations

// Initialize router
const router = express.Router();

// API endpoint to get Tic Tac Toe stats for a specific user
// Not used yet
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
    //socket event handlers
    io.of('/tic-tac-toe').on('connection', (socket) => {
        console.log(`User connected to Tic-Tac-Toe with socket ID: ${socket.id}`);

        // Handle user identification
        socket.on('identify', (userId) => {
            socket.userId = userId;
            console.log(`User with ID ${userId} connected with socket ID: ${socket.id}`);
        });

        // Handle Quick Match requests
        socket.on('quickMatch', ({ gameType, userId }) => {
            console.log(`Quick match requested by ${userId} for ${gameType}`);
            ticTacToeController.findMatch(io, socket, gameType, userId); 
        });

        socket.on('rankedMatch', async ({ gameType, userId }) => {
            console.log(`Ranked match requested by ${userId} for ${gameType}`);
            // Fetch player's skill rating from DB
            const skillRating = await getPlayerSkillRating(userId, gameType); // implement this function
            ticTacToeController.findRankedMatch(io, socket, gameType, userId, skillRating);
        });        

        // Handle player moves
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

        // Handle page leave/component unmount
        socket.on('leavePage', () => {
            handlePlayerLeave(socket);
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User with socket ID: ${socket.id} disconnected.`);
            handlePlayerLeave(socket);      
        });

        // Helper function to handle player leaving
        function handlePlayerLeave(socket) {
            const playerId = socket.userId;
            if(playerId){
                //delete ticTacToeController.connectedPlayers[playerId];
                //matchmakingManager.removePlayerFromQueue(playerId);
            }
            socket.leaveAll();
            console.log(`Cleanup completed for player ${playerId}`);
        }



        //
        //
        // Section for games via codes
        //
        //

        socket.on('createNewGame', ({ gameType, userId }) => {
            console.log(`Create New Game request from user ${userId} for game type ${gameType}`);
            const gameId = ticTacToeController.createGame(io, socket, gameType, userId);
            if (gameId) {
                socket.emit('gameCreated', { gameId });
            } else {
                socket.emit('error', { message: 'Failed to create game.' });
            }
        });
        
        socket.on('joinGameByCode', ({ gameId, userId }) => {
            console.log(`Join Game by Code request from user ${userId} for game ID ${gameId}`);
            const success = ticTacToeController.joinGameByCode(io, socket, gameId, userId);
            if (!success) {
                socket.emit('error', { message: 'Game not found or is full.' });
            }
        });
    });

    return router;
};
