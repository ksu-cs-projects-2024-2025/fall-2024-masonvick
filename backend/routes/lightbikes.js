// backend/routes/lightbikes.js

const express = require('express');
const lightbikesController = require('../controllers/lightbikesController'); // Controller for Lightbikes logic
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
            console.log(`User with socket ID: ${socket.id} disconnected.`);
        });
    });

    return router;
};
