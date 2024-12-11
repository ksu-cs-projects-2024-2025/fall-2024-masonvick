// backend/routes/tictactoe.js

const express = require('express');
const ticTacToeController = require('../controllers/tictactoeController'); // import ttt controller
const matchmakingManager = require('../matchmakingManager'); //import mmManager
const { getPlayerSkillRating } = require('../utils');
//console.log('ticTacToeController:', ticTacToeController);  // logs controller and its functions

// Initialize router
const router = express.Router();

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
            socket.leaveAll();
        }

        // Handle player moves
        socket.on('makeMove', (data) => {
            ticTacToeController.handleMove(io, socket, data);
        });
        
    });

    return router;
};
