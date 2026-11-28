-- Optional QA data: users (passwords via npm run bootstrap-admin), sample items & requests.
-- Safe to re-run where noted. Does not DROP data.
USE LabInventory;
GO

DECLARE @AdminRole INT = (SELECT RoleID FROM dbo.Roles WHERE RoleName = N'Admin');
DECLARE @FtRole INT = (SELECT RoleID FROM dbo.Roles WHERE RoleName = N'Full-time Lab Worker');
DECLARE @StRole INT = (SELECT RoleID FROM dbo.Roles WHERE RoleName = N'Student Worker');

INSERT INTO dbo.Users (FirstName, LastName, Email, RoleID, IsActive, Phone, PasswordHash)
SELECT v.FirstName, v.LastName, v.Email, v.RoleID, 1, v.Phone, NULL
FROM (VALUES
    (N'Alex', N'Student', N'student.a@lab.example', @StRole, NULL),
    (N'Blake', N'Student', N'student.b@lab.example', @StRole, NULL),
    (N'Fran', N'Worker', N'worker.ft@lab.example', @FtRole, N'814-555-0200'),
    (N'Ada', N'Admin', N'admin@lab.example', @AdminRole, NULL)
) v(FirstName, LastName, Email, RoleID, Phone)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Users u WHERE u.Email = v.Email);
GO

-- Sample items (aligned with FE QA doc; Filament in 3D area, etc.)
DECLARE @Filament INT = (SELECT CategoryID FROM dbo.Categories WHERE CategoryName = N'Filament' AND ParentCategoryID IS NULL);
DECLARE @Drills INT = (SELECT CategoryID FROM dbo.Categories WHERE CategoryName = N'Drills' AND ParentCategoryID IS NULL);
DECLARE @Glasses INT = (SELECT CategoryID FROM dbo.Categories WHERE CategoryName = N'Glasses' AND ParentCategoryID IS NULL);
DECLARE @Area3D INT = (SELECT a.AreaID FROM dbo.Areas a JOIN dbo.Spaces s ON s.SpaceID = a.SpaceID WHERE s.SpaceName = N'Makerspace' AND a.AreaName = N'3D Printer Area');
DECLARE @AreaMsShelf INT = (SELECT a.AreaID FROM dbo.Areas a JOIN dbo.Spaces s ON s.SpaceID = a.SpaceID WHERE s.SpaceName = N'Makerspace' AND a.AreaName = N'Shelf');
DECLARE @AreaPrShelf INT = (SELECT a.AreaID FROM dbo.Areas a JOIN dbo.Spaces s ON s.SpaceID = a.SpaceID WHERE s.SpaceName = N'Project Room' AND a.AreaName = N'Shelf');

IF NOT EXISTS (SELECT 1 FROM dbo.Items WHERE ItemName = N'Makerspace PLA Black')
    INSERT INTO dbo.Items (ItemName, CategoryID, AreaID, TrackingType, QuantityOnHand, ReorderLevel, Notes)
    VALUES (N'Makerspace PLA Black', @Filament, @Area3D, 'Bulk', 12, 4, N'1.75mm spools');
IF NOT EXISTS (SELECT 1 FROM dbo.Items WHERE ItemName = N'Makerspace Resin Grey')
    INSERT INTO dbo.Items (ItemName, CategoryID, AreaID, TrackingType, QuantityOnHand, ReorderLevel, Notes)
    VALUES (N'Makerspace Resin Grey', @Filament, @Area3D, 'Bulk', 2, 3, N'');
IF NOT EXISTS (SELECT 1 FROM dbo.Items WHERE ItemName = N'Cordless Drill')
    INSERT INTO dbo.Items (ItemName, CategoryID, AreaID, TrackingType, QuantityOnHand, ReorderLevel, Notes)
    VALUES (N'Cordless Drill', @Drills, @AreaPrShelf, 'Unit', 0, 1, N'Out of stock fixture');
GO