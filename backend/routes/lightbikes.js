// backend/routes/lightbikes.js

const express = require('express');
const lightbikesController = require('../controllers/lightbikesController'); // Controller for Lightbikes logic
const matchmakingManager = require('../matchmakingManager'); // Matchmaking manager
const { getPlayerSkillRating } = require('../utils');
console.log('lightbikesController:', lightbikesController);  // Log the controller to check for functions
const router = express.Router();

module.exports = (io) => {
    // Set up a WebSocket namespace for Lightbikes
    io.of('/lightbikes').on('connection', (socket) => {
        console.log(`User connected to Lightbikes with socket ID: ${socket.id}`);

        // Handle user identification
        socket.on('identify', (userId) => {
            socket.userId = userId;
            console.log(`User with internal ID ${userId} connected with socket ID: ${socket.id}`);
        });

        // Handle page leave/component unmount
        socket.on('leavePage', () => {
            handlePlayerLeave(socket);
        });

        // Handle Quick Match requests
        socket.on('quickMatch', ({ gameType, userId}) => {
            console.log(`Quick match requested by ${userId} for ${gameType}`);
            // Call the quick match logic from the controller
            lightbikesController.findMatch(io, socket, gameType, userId);
        });

        // Handle steering (moving direction)
        socket.on('steer', (data) => {
            console.log("Steer event received:", data);  // Log received data
            lightbikesController.handleSteer(io, socket, data);
        });

        socket.on('createNewGame', ({ gameType, userId }) => {
            const gameId = lightbikesController.createGame(io, socket, gameType, userId);
            if (gameId) {
                socket.emit('gameCreated', { gameId });
            } else {
                socket.emit('error', { message: 'Failed to create game.' });
            }
        });

        socket.on('rankedMatch', async ({ gameType, userId }) => {
            console.log(`Ranked match requested by ${userId} for ${gameType}`);
            const skillRating = await getPlayerSkillRating(userId, gameType); // implement this function
            lightbikesController.findRankedMatch(io, socket, gameType, userId, skillRating);
        });
        
        
        socket.on('joinGameByCode', ({ gameId, userId }) => {
            const success = lightbikesController.joinGameByCode(io, socket, gameId, userId);
            if (!success) {
                socket.emit('error', { message: 'Game not found or is full.' });
            }
        });

        // Handle players joining the game room
        socket.on('joinGame', ({ gameId }) => {
            lightbikesController.joinGame(io, socket, gameId);  // Emit game state when a player joins
        });

        // Handle resetting the game
        socket.on('resetGame', ({ gameId }) => {
            lightbikesController.resetGame(io, socket, gameId);
        });

        // Handle rematch request
        socket.on('requestRematch', ({ gameId }) => {
            lightbikesController.requestRematch(io, socket, gameId);
        });

        // Handle rematch acceptance
        socket.on('acceptRematch', ({ gameId }) => {
            lightbikesController.acceptRematch(io, socket, gameId);
        });

        // Handle rematch decline
        socket.on('declineRematch', ({ gameId }) => {
            lightbikesController.declineRematch(io, socket, gameId);
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            handlePlayerLeave(socket);
        });

        // Helper function to handle player leaving
        function handlePlayerLeave(socket) {
            const playerId = socket.userId;
            matchmakingManager.removePlayerFromQueue(playerId);
            socket.leaveAll();
        }

    });

    return router;
};
