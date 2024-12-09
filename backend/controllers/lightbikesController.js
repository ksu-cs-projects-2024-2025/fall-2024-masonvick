// backend/controllers/lightbikesController.js

const { connect } = require('http2');
const { getPlayerSkillRating } = require('../utils');
const matchmakingManager = require('../matchmakingManager');
const sql = require('mssql');
const connectedPlayers = {};
const WIDTH = 100;
const HEIGHT = 100;

// Function to find or create a match
exports.findMatch = (io, socket, gameType, userId) => {
    //console.log(`Looking for a match for player ${userId} in game type ${gameType}`);

    connectedPlayers[userId] = socket.id;

    const match = matchmakingManager.findLightbikesMatch(io, userId, connectedPlayers);

    if (match) {
        const { gameId, players } = match;
        
        players.forEach(playerId => {
            const playerSocket = io.of('/lightbikes').sockets.get(connectedPlayers[playerId]);
            if (playerSocket) {
                playerSocket.join(gameId);
                playerSocket.gameId = gameId;  // Add this line
                console.log(`Player ${playerId} joined room ${gameId}`);
                playerSocket.emit('matchFound', { gameId, players }); // Notify both players of the match
            } else {
                console.error(`Socket not found for player ${playerId}`);
            }
        });

        exports.emitGameState(io, gameId); // Emit initial game state
        exports.startGame(io, gameId); // Start game loop
    } else {
        console.log(`User ${userId} is waiting for a match in ${gameType}`);
    }
};

// Start the game
exports.startGame = (io, gameId) => {
    const game = matchmakingManager.games[gameId];
    if (!game) {
        console.error(`Game with ID ${gameId} not found.`);
        return;
    }

    // Clear any existing interval just in case
    if (game.interval) {
        clearInterval(game.interval);
    }

    // Initialize game state and players' starting positions
    //game.gameState = game.initializeGameState();
    game.state = new Uint8Array(WIDTH * HEIGHT); // Store the grid as a 1D array for trails

    console.log(`Starting game ${gameId} with players: ${game.players}`);
    game.players.forEach((playerId, index) => {
        const startingPosition = getRandomStartingPosition();
        
        // Initialize player positions and trails
        game.gameState.playerPositions[playerId] = {
            x: startingPosition.x,
            y: startingPosition.y,
            direction: getRandomDirection(),
            trail: [{ x: startingPosition.x, y: startingPosition.y }],
            trailLength: 0,
            steers: [],
            color: index === 0 ? 'red' : 'blue'  // Color-code players
        };
        console.log(`Initialized player ${playerId} at position:`, game.gameState.playerPositions[playerId]);
    });

    // Emit the initialized game state to players before starting the loop
    exports.emitGameState(io, gameId);
    console.log(`Starting lightbikes game ${gameId} with players:`, game.players);

    // Set up the main game loop to move players and check for collisions
    game.interval = setInterval(() => {
        // Check if the game is already over
        if (game.gameState.gameOver) {
            clearInterval(game.interval);
            const endTime = new Date();  // Capture game end time

            // Log the game ending
            console.log(`Game over for gameId ${gameId}`);

            // Prepare data for storing in the database
            const player1Id = game.players[0];
            const player2Id = game.players[1];
            const winnerId = game.gameState.winner;
            const player1Steers = game.gameState.playerPositions[player1Id].steers.join(',');
            const player2Steers = game.gameState.playerPositions[player2Id].steers.join(',');
            const player1TrailLength = game.gameState.playerPositions[player1Id].trailLength;
            const player2TrailLength = game.gameState.playerPositions[player2Id].trailLength;

            // Store game in the database
            storeLightbikesGameInDB(
                player1Id,
                player2Id,
                winnerId,
                player1Steers,
                player2Steers,
                player1TrailLength,
                player2TrailLength,
                game.startTime,
                endTime
            );

            endGame(io, gameId, winnerId);

            return;
        }

        console.log(`Game loop running for gameId ${gameId}`);
        game.players.forEach(playerId => {
            const player = game.gameState.playerPositions[playerId];
            console.log(`Moving player ${playerId} in direction ${player.direction}`);

            // Update player position based on current direction
            switch (player.direction) {
                case 'up': player.y--; break;
                case 'down': player.y++; break;
                case 'left': player.x--; break;
                case 'right': player.x++; break;
                default:
                    console.error(`Invalid direction for player ${playerId}: ${player.direction}`);
                    break;
            }

            console.log(`Player ${playerId} new position: (${player.x}, ${player.y})`);

            // Add current position to player's trail
            player.trail.push({ x: player.x, y: player.y });
            player.trailLength++;

            // Check for collisions
            if (checkCollision(game, player)) {
                //console.log(`Collision detected`);
                game.gameState.gameOver = true;
                game.gameState.winner = getOpponent(playerId, game);  // Set the winner
                console.log(`Game over due to collision for player ${playerId}`);
                return;
            }

            // Update grid position for the player's trail
            game.state[player.y * WIDTH + player.x] = playerId;
        });

        // Emit the updated game state after all players have moved
        exports.emitGameState(io, gameId);
    }, 100);  // Game loop interval for real-time updates
};

// Emit the game state to all players
exports.emitGameState = (io, gameId) => {
    const game = matchmakingManager.games[gameId];
    if (game) {
        //const gameState = game.gameState;
        console.log(`Emitting game state for gameId ${gameId} to room ${gameId}`); 
        io.of('/lightbikes').to(gameId).emit('gameState', game.gameState);  // Emit to all players in the room
    } else {
        console.error(`Game with ID ${gameId} not found.`);
    }
};

exports.createGame = (io, socket, gameType, userId) => {
    try {
        const gameId = matchmakingManager.createGameSession(gameType, userId);
        const game = matchmakingManager.games[gameId];

        if (!game) {
            console.error(`Failed to create Lightbikes game session for user ${userId}.`);
            return null;
        }

        game.players = [userId];
        if (!game.gameState) {
            game.gameState = game.initializeGameState();
        }

        // Store the player's socket ID
        connectedPlayers[userId] = socket.id;

        socket.emit('gameCreated', { gameId });
        return gameId;
    } catch (error) {
        console.error('Error creating Lightbikes game:', error);
        socket.emit('error', { message: 'Failed to create game. Please try again.' });
        return null;
    }
};

exports.joinGameByCode = (io, socket, gameId, userId) => {
    const game = matchmakingManager.joinLightbikesGame(gameId, userId);
    if (!game) {
        console.error(`Lightbikes game with ID ${gameId} not found or is full.`);
        return false;
    }

    // Ensure connectedPlayers[userId] is set
    connectedPlayers[userId] = socket.id;

    // Join both players to the game room
    game.players.forEach((playerId) => {
        const playerSocketId = connectedPlayers[playerId];
        const playerSocket = io.of('/lightbikes').sockets.get(playerSocketId);
        if (playerSocket) {
            playerSocket.join(gameId);
        } else {
            console.error(`Socket not found for player ${playerId}`);
        }
    });

    // Notify both players
    socket.emit('matchFound', { gameId, players: game.players });
    socket.broadcast.to(gameId).emit('matchFound', { gameId, players: game.players });

    // Start or emit initial game state, just like in quick match
    exports.emitGameState(io, gameId);
    exports.startGame(io, gameId);

    return true;
};


// Handle steering when arrow keys are pressed
exports.handleSteer = (io, socket, { gameId, direction }) => {
    console.log(`Received steering input: ${direction} for gameId: ${gameId}`);  // Debugging log
    console.log(`Processing steer from user: ${socket.userId}`);

    const game = matchmakingManager.games[gameId];

    // Check if the game is over before processing moves
    if (!game || !game.gameState || game.gameState.gameOver) {
        console.log(`Game ${gameId} is invalid or over. Ignoring move.`);
        return;
    }

    console.log('Current game state players:', Object.keys(game.gameState.playerPositions));
    console.log('Attempting to move player:', socket.userId);

    const player = game.gameState.playerPositions[socket.userId];

    if (!player) {
        console.error(`Player ${socket.userId} not found in game ${gameId}`);
        console.log('Available players:', game.players);
        console.log('Player positions:', game.gameState.playerPositions);
        return;
    }

    // Validate direction change (prevent 180-degree turns)
    if (!isValidDirectionChange(player.direction, direction)) {
        console.log(`Invalid direction change from ${player.direction} to ${direction}`);
        return;
    }

    console.log(`Updating direction for player ${socket.userId} to ${direction}`);
    player.steers.push(direction);
    player.direction = direction;
    
    io.of('/lightbikes').to(gameId).emit('gameState', game.gameState);

};

exports.findRankedMatch = (io, socket, gameType, userId, skillRating) => {
    console.log(`Looking for a ranked Lightbikes match for user ${userId} with rating ${skillRating}`);

    // Store the player's socket ID
    connectedPlayers[userId] = socket.id;

    // Attempt to find a ranked match through matchmakingManager
    const match = matchmakingManager.findRankedMatch(gameType, userId, skillRating, connectedPlayers);

    if (match) {
        const { gameId, players } = match;

        players.forEach(playerId => {
            const playerSocket = io.of('/lightbikes').sockets.get(connectedPlayers[playerId]);
            if (playerSocket) {
                playerSocket.join(gameId);
                playerSocket.gameId = gameId;
                console.log(`Player ${playerId} joined ranked Lightbikes room ${gameId}`);
                playerSocket.emit('matchFound', { gameId, players });
            } else {
                console.error(`Socket not found for ranked Lightbikes player ${playerId}`);
            }
        });

        // Emit initial game state and start the Lightbikes game loop
        exports.emitGameState(io, gameId);
        exports.startGame(io, gameId);
    } else {
        // No match found yet; user waits in the queue
        console.log(`User ${userId} with rating ${skillRating} is waiting for a ranked Lightbikes match.`);
    }
};


// Function to handle a player joining a game room
exports.joinGame = (io, socket, gameId) => {
    const game = matchmakingManager.games[gameId];

    if (game) {
        console.log(`Player joined game ${gameId}`);
        socket.join(gameId);  // Ensure the socket joins the room
        // Initialize game state if it's not set for a new game or rematch
        if (!game.gameState) {
            game.gameState = game.initializeGameState();
        }
        socket.emit('gameState', game.gameState);  // Emit the initial game state to the player who joined
    } else {
        console.error(`Game with ID ${gameId} not found`);
    }
};

// This function ends the game and performs cleanup.
const endGame = (io, gameId, winnerId) => {
    console.log(`Game ${gameId} has ended. Winner: ${winnerId}`);
    const game = matchmakingManager.games[gameId];
    if (!game) return;

    // Emit a game over event to all players in the room
    io.of('/lightbikes').to(gameId).emit('gameOver', { winner: winnerId });

    console.log(`Cleaning up listeners and clearing game data for game ${gameId}`)

    // Remove event listeners for each player's socket to prevent lingering listeners
    game.players.forEach(playerId => {
        const playerSocket = io.of('/lightbikes').sockets.get(connectedPlayers[playerId]);
        if (playerSocket) {
            console.log(`Removing steer event listeners for player ${playerId} in game ${gameId}`);
            //playerSocket.removeAllListeners('steer'); // Remove the 'steer' listener
        }
        delete connectedPlayers[playerId];
    });

    // Delete the game from matchmakingManager to clear it from memory
    delete matchmakingManager.games[gameId];
    console.log(`Game ${gameId} has ended and been removed from matchmaking manager.`);
};

// Function to store Lightbikes game data in the database
async function storeLightbikesGameInDB(player1Id, player2Id, winnerId, player1Steers, player2Steers, player1TrailLength, player2TrailLength, startTime, endTime) {
    try {
        console.log(`Storing game data:`, {
            player1Id, player2Id, winnerId, player1Steers, player2Steers,
            player1TrailLength, player2TrailLength, startTime, endTime
        });

        // Insert the game record into the LightbikesGames table
        await sql.query`
            INSERT INTO LightbikesGames (
                Player1Id, Player2Id, WinnerId, Player1Steers, Player2Steers,
                Player1TrailLength, Player2TrailLength, StartTime, EndTime
            )
            VALUES (
                ${player1Id}, ${player2Id}, ${winnerId}, ${player1Steers}, ${player2Steers},
                ${player1TrailLength}, ${player2TrailLength}, ${startTime}, ${endTime}
            )
        `;
        console.log('Lightbikes game successfully stored in the database');
    } catch (err) {
        console.error('Error inserting Lightbikes game data into the database:', err);
    }
}

// Utility functions for collision detection, random starting positions, etc.
function checkCollision(game, playerPosition) {
    const { x, y } = playerPosition;

    // Check for collision with walls
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) {
        return true;
    }

    // Check for collision with other players' trails
    if (game.state[y * WIDTH + x] !== 0) {
        return true;
    }

    return false;
}

// Get random starting positions, ensuring players aren't too close to each other or walls
function getRandomStartingPosition(game) {
    const gridSize = 100;  // Assuming the grid is 100x100
    const buffer = 10;     // Buffer distance from the walls and between players

    let x, y;
    let validPosition = false;

    while (!validPosition) {
        x = Math.floor(Math.random() * (gridSize - 2 * buffer)) + buffer;  // Avoid walls
        y = Math.floor(Math.random() * (gridSize - 2 * buffer)) + buffer;

        // Check if the position is too close to other players
        validPosition = true;
        for (const playerId in game.gameState.playerPositions) {
            const otherPosition = game.gameState.playerPositions[playerId];
            const distance = Math.sqrt(Math.pow(x - otherPosition.x, 2) + Math.pow(y - otherPosition.y, 2));
            if (distance < buffer) {
                validPosition = false;  // Too close to another player
                break;
            }
        }
    }

    return { x, y };
}

function getRandomStartingPosition() {
    const buffer = 10;
    return {
        //set random x and y positions within the game board using a buffer
        // to ensure that the players are not too close to each other or the walls
        x: Math.floor(Math.random() * (WIDTH - 2 * buffer)) + buffer,
        y: Math.floor(Math.random() * (HEIGHT - 2 * buffer)) + buffer
    };
}

function getRandomDirection() {
    const directions = ['up', 'down', 'left', 'right'];
    return directions[Math.floor(Math.random() * directions.length)];
}

function getOpponent(playerId, game) {
    return game.players.find(id => id !== playerId);
}


//players can only change direction if they are not moving in the opposite direction
//used to die if they went directly backwards
function isValidDirectionChange(currentDir, newDir) {
    const invalidPairs = {
        'up': 'down',
        'down': 'up',
        'left': 'right',
        'right': 'left'
    };
    return invalidPairs[currentDir] !== newDir;
}