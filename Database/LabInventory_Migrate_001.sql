-- LabInventory_Migrate_001.sql
-- Non-destructive migration. Safe to run more than once. No DROP DATABASE.
USE LabInventory;
GO

-- Users: auth and profile columns
IF COL_LENGTH('dbo.Users', 'PasswordHash') IS NULL
    ALTER TABLE dbo.Users ADD PasswordHash NVARCHAR(255) NULL;
GO
IF COL_LENGTH('dbo.Users', 'Phone') IS NULL
    ALTER TABLE dbo.Users ADD Phone NVARCHAR(40) NULL;
GO

-- Sessions
IF OBJECT_ID('dbo.UserSessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserSessions (
        SessionID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        UserID    INT NOT NULL REFERENCES dbo.Users(UserID),
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        ExpiresAt DATETIME2 NOT NULL
    );
END
GO

-- Supply requests: either an existing item or a new item name
IF OBJECT_ID('dbo.SupplyRequests', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SupplyRequests (
        RequestID           INT IDENTITY(1,1) PRIMARY KEY,
        RequestedByUserID   INT NOT NULL REFERENCES dbo.Users(UserID),
        ItemID              INT NULL REFERENCES dbo.Items(ItemID),
        ItemNameSnapshot    NVARCHAR(150) NOT NULL DEFAULT N'',
        NewItemName         NVARCHAR(200) NULL,
        TargetAreaID        INT NOT NULL REFERENCES dbo.Areas(AreaID),
        Quantity            INT NOT NULL CHECK (Quantity > 0),
        Reason              NVARCHAR(500) NULL,
        Status              VARCHAR(20) NOT NULL DEFAULT 'Pending'
            CHECK (Status IN ('Pending','Approved','Rejected')),
        ReviewedByUserID    INT NULL REFERENCES dbo.Users(UserID),
        ReviewNotes         NVARCHAR(500) NULL,
        ReviewedAt          DATETIME2 NULL,
        CreatedAt           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        RowVersion          ROWVERSION NOT NULL,
        CONSTRAINT CK_SupplyRequests_ItemOrNew CHECK (
            (ItemID IS NOT NULL AND (NewItemName IS NULL OR LTRIM(RTRIM(NewItemName)) = N''))
            OR (ItemID IS NULL AND NewItemName IS NOT NULL AND LEN(LTRIM(RTRIM(NewItemName))) > 0))
    );
    CREATE INDEX IX_SupplyRequests_RequestedBy ON dbo.SupplyRequests (RequestedByUserID);
    CREATE INDEX IX_SupplyRequests_Status_Area ON dbo.SupplyRequests (Status, TargetAreaID);
END
GO

IF COL_LENGTH('dbo.SupplyRequests', 'ItemNameSnapshot') IS NULL
    ALTER TABLE dbo.SupplyRequests ADD ItemNameSnapshot NVARCHAR(150) NOT NULL CONSTRAINT DF_SR_Snap DEFAULT N'' WITH VALUES;
GO

IF COL_LENGTH('dbo.Users', 'CreatedAt') IS NULL
    ALTER TABLE dbo.Users ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Users_CreatedAt2 DEFAULT SYSUTCDATETIME();
GO

IF COL_LENGTH('dbo.UserSessions', 'CsrfToken') IS NULL
    ALTER TABLE dbo.UserSessions ADD CsrfToken NVARCHAR(64) NOT NULL CONSTRAINT DF_Session_Csrf DEFAULT N'';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Items') AND name = 'RowVersion')
    ALTER TABLE dbo.Items ADD RowVersion ROWVERSION NOT NULL;
GO

-- Roles (names must match current-user.js)
INSERT INTO dbo.Roles (RoleName)
SELECT v.RoleName
FROM (VALUES (N'Admin'), (N'Full-time Lab Worker'), (N'Student Worker')) AS v(RoleName)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles r WHERE r.RoleName = v.RoleName);
GO

-- Side Shelves + Length Measurement Sets mapping
INSERT INTO dbo.AreaCategories (AreaID, CategoryID)
SELECT a.AreaID, c.CategoryID
FROM dbo.Areas a
JOIN dbo.Spaces s ON s.SpaceID = a.SpaceID
CROSS JOIN dbo.Categories c
WHERE s.SpaceName = N'Project Room'
  AND a.AreaName = N'Side Shelves'
  AND c.CategoryName = N'Length Measurement Sets'
  AND NOT EXISTS (SELECT 1 FROM dbo.AreaCategories ac
                  WHERE ac.AreaID = a.AreaID AND ac.CategoryID = c.CategoryID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Items_Area_Category')
    CREATE INDEX IX_Items_Area_Category ON dbo.Items (AreaID, CategoryID);
GO

-- View: area labels for the front end
CREATE OR ALTER VIEW dbo.vw_AreaDisplay AS
SELECT a.AreaID, a.SpaceID, a.AreaName,
       s.SpaceName + N' - ' + a.AreaName AS DisplayLabel
FROM dbo.Areas a
JOIN dbo.Spaces s ON s.SpaceID = a.SpaceID;
GO

-- View: category inheritance rule (a category is valid in an area if it,
-- or any ancestor, is mapped in AreaCategories)
DROP VIEW IF EXISTS dbo.vw_ValidAreaCategories;
GO
CREATE VIEW dbo.vw_ValidAreaCategories AS
WITH Tree (LeafCategoryID, AncestorID) AS (
    SELECT CategoryID, CategoryID
    FROM dbo.Categories
    UNION ALL
    SELECT t.LeafCategoryID, c.ParentCategoryID
    FROM Tree t
    JOIN dbo.Categories c ON c.CategoryID = t.AncestorID
    WHERE c.ParentCategoryID IS NOT NULL
)
SELECT DISTINCT ac.AreaID, t.LeafCategoryID AS CategoryID
FROM Tree t
JOIN dbo.AreaCategories ac ON ac.CategoryID = t.AncestorID;
GO

-- Audited quantity change (+/- buttons)
CREATE OR ALTER PROCEDURE dbo.usp_AdjustItemQuantity
    @ItemID INT,
    @UserID INT,
    @Change INT,
    @Notes  NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Change = 0
        THROW 50002, 'Quantity change must be non-zero.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserID = @UserID AND IsActive = 1)
        THROW 50003, 'Invalid or inactive user.', 1;

    DECLARE @Current INT;
    DECLARE @NewQty BIGINT;
    SELECT @Current = QuantityOnHand FROM dbo.Items WITH (UPDLOCK, ROWLOCK) WHERE ItemID = @ItemID;
    IF @Current IS NULL
        THROW 50001, 'Item not found or quantity would go below zero.', 1;

    SET @NewQty = CAST(@Current AS BIGINT) + CAST(@Change AS BIGINT);
    IF @NewQty < 0 OR @NewQty > 2147483647
        THROW 50004, 'Quantity out of allowed range.', 1;

    DECLARE @LogType VARCHAR(15) = CASE WHEN @Change >= 0 THEN 'Restock' ELSE 'Consume' END;
    DECLARE @LogQty INT = ABS(@Change);

    BEGIN TRAN;

    UPDATE dbo.Items
    SET QuantityOnHand = CAST(@NewQty AS INT)
    WHERE ItemID = @ItemID
      AND QuantityOnHand = @Current;

    IF @@ROWCOUNT = 0
    BEGIN
        ROLLBACK;
        THROW 50001, 'Item not found or quantity would go below zero.', 1;
    END

    INSERT INTO dbo.InventoryLogs (ItemID, UserID, ProcessedByID, LogType, Quantity, LogDate, Notes)
    VALUES (@ItemID, @UserID, @UserID, @LogType, @LogQty, SYSUTCDATETIME(), @Notes);

    COMMIT;
END;
GO
