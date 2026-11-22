
USE LabInventory;
GO

-- Delete children before parents (foreign keys)
DELETE FROM dbo.SupplyRequests;
DELETE FROM dbo.InventoryLogs;
DELETE FROM dbo.UserSessions;
DELETE FROM dbo.Items;
DELETE FROM dbo.Users;
GO

-- Reset ID counters so the next rows start at 1
DBCC CHECKIDENT ('dbo.SupplyRequests', RESEED, 0);
DBCC CHECKIDENT ('dbo.InventoryLogs', RESEED, 0);
DBCC CHECKIDENT ('dbo.Items', RESEED, 0);
DBCC CHECKIDENT ('dbo.Users', RESEED, 0);
GO