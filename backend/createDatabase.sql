-- Create the database
CREATE DATABASE siteDB;
GO

-- Use the created database
USE siteDB;
GO

-- Create the Users table
CREATE TABLE Users (
    Id INT PRIMARY KEY IDENTITY(1,1),
    Username NVARCHAR(50) NOT NULL UNIQUE,
    Email NVARCHAR(255) NOT NULL UNIQUE,
    Password NVARCHAR(MAX),
    Name NVARCHAR(100),
    GoogleId NVARCHAR(50),
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- Create the TicTacToeGames table
CREATE TABLE TicTacToeGames (
    GameId INT PRIMARY KEY IDENTITY(1,1),
    Player1Id INT NOT NULL,
    Player2Id INT NOT NULL,
    WinnerId INT,
    Player1Symbol CHAR(1),
    Player2Symbol CHAR(1),
    Moves NVARCHAR(MAX),
    StartTime DATETIME,
    EndTime DATETIME,
    FOREIGN KEY (Player1Id) REFERENCES Users(Id),
    FOREIGN KEY (Player2Id) REFERENCES Users(Id),
    FOREIGN KEY (WinnerId) REFERENCES Users(Id)
);

-- Create the LightbikesGames table
CREATE TABLE LightbikesGames (
    GameId INT PRIMARY KEY IDENTITY(1,1),
    Player1Id INT NOT NULL,
    Player2Id INT NOT NULL,
    WinnerId INT,
    Player1Steers NVARCHAR(MAX),
    Player2Steers NVARCHAR(MAX),
    Player1TrailLength INT,
    Player2TrailLength INT,
    StartTime DATETIME,
    EndTime DATETIME,
    FOREIGN KEY (Player1Id) REFERENCES Users(Id),
    FOREIGN KEY (Player2Id) REFERENCES Users(Id),
    FOREIGN KEY (WinnerId) REFERENCES Users(Id)
);