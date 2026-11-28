-- LabInventory_Init.sql
-- Safe bootstrap: CREATE DATABASE only when missing. No DROP DATABASE.
-- Use instead of executing the broken LabInventory.sql UTF-16 script directly.
-- Preserves taxonomy seed from the group schema; users/items loaded via bootstrap API or LabInventory_Seed_QA_Data.sql.

IF DB_ID(N'LabInventory') IS NULL
    CREATE DATABASE LabInventory;
GO

USE LabInventory;
GO

/* ---------- USERS & ROLES ---------- */
IF OBJECT_ID(N'dbo.Roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Roles (
        RoleID   INT IDENTITY(1,1) PRIMARY KEY,
        RoleName NVARCHAR(50) NOT NULL UNIQUE
    );
END
GO

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        UserID       INT IDENTITY(1,1) PRIMARY KEY,
        FirstName    NVARCHAR(100) NOT NULL,
        LastName     NVARCHAR(100) NOT NULL,
        Email        NVARCHAR(255) NOT NULL UNIQUE,
        RoleID       INT NOT NULL REFERENCES dbo.Roles(RoleID),
        IsActive     BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (1),
        Phone        NVARCHAR(40) NULL,
        PasswordHash NVARCHAR(255) NULL,
        CreatedAt    DATETIME2 NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME())
    );
END
GO

IF OBJECT_ID(N'dbo.UserSessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserSessions (
        SessionID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        UserID    INT NOT NULL REFERENCES dbo.Users(UserID),
        CsrfToken NVARCHAR(64) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        ExpiresAt DATETIME2 NOT NULL
    );
    CREATE INDEX IX_UserSessions_User ON dbo.UserSessions(UserID);
    CREATE INDEX IX_UserSessions_Expires ON dbo.UserSessions(ExpiresAt);
END
GO

/* ---------- LOCATIONS ---------- */
IF OBJECT_ID(N'dbo.Spaces', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Spaces (
        SpaceID   INT IDENTITY(1,1) PRIMARY KEY,
        SpaceName NVARCHAR(100) NOT NULL UNIQUE
    );
END
GO

IF OBJECT_ID(N'dbo.Areas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Areas (
        AreaID   INT IDENTITY(1,1) PRIMARY KEY,
        SpaceID  INT NOT NULL REFERENCES dbo.Spaces(SpaceID),
        AreaName NVARCHAR(100) NOT NULL,
        CONSTRAINT UQ_Areas_Space_AreaName UNIQUE (SpaceID, AreaName)
    );
END
GO

/* ---------- CATEGORIES ---------- */
IF OBJECT_ID(N'dbo.Categories', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Categories (
        CategoryID       INT IDENTITY(1,1) PRIMARY KEY,
        ParentCategoryID INT NULL REFERENCES dbo.Categories(CategoryID),
        CategoryName     NVARCHAR(100) NOT NULL,
        CONSTRAINT UQ_Categories_Parent_Name UNIQUE (ParentCategoryID, CategoryName)
    );
END
GO

IF OBJECT_ID(N'dbo.AreaCategories', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AreaCategories (
        AreaID     INT NOT NULL REFERENCES dbo.Areas(AreaID),
        CategoryID INT NOT NULL REFERENCES dbo.Categories(CategoryID),
        PRIMARY KEY (AreaID, CategoryID)
    );
END
GO

/* ---------- ITEMS & LOGS (correct dependency order) ---------- */
IF OBJECT_ID(N'dbo.Items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Items (
        ItemID         INT IDENTITY(1,1) PRIMARY KEY,
        ItemName       NVARCHAR(150) NOT NULL,
        CategoryID     INT NOT NULL REFERENCES dbo.Categories(CategoryID),
        AreaID         INT NOT NULL REFERENCES dbo.Areas(AreaID),
        TrackingType   VARCHAR(10) NOT NULL DEFAULT 'Bulk'
            CHECK (TrackingType IN ('Unit','Bulk')),
        QuantityOnHand INT NOT NULL DEFAULT 1 CHECK (QuantityOnHand >= 0),
        ReorderLevel   INT NULL,
        AssetTag       NVARCHAR(50) NULL,
        Status         VARCHAR(20) NOT NULL DEFAULT 'Available'
            CHECK (Status IN ('Available','CheckedOut','Broken')),
        Notes          NVARCHAR(500) NULL,
        CreatedAt      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        RowVersion     ROWVERSION NOT NULL
    );
    CREATE UNIQUE INDEX UX_Items_AssetTag ON dbo.Items(AssetTag) WHERE AssetTag IS NOT NULL;
    CREATE INDEX IX_Items_Category ON dbo.Items(CategoryID);
    CREATE INDEX IX_Items_Area ON dbo.Items(AreaID);
END
GO

IF OBJECT_ID(N'dbo.InventoryLogs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventoryLogs (
        LogID         BIGINT IDENTITY(1,1) PRIMARY KEY,
        ItemID        INT NOT NULL REFERENCES dbo.Items(ItemID),
        UserID        INT NOT NULL REFERENCES dbo.Users(UserID),
        ProcessedByID INT NULL REFERENCES dbo.Users(UserID),
        LogType       VARCHAR(15) NOT NULL
            CHECK (LogType IN ('CheckOut','CheckIn','Consume','Restock','Adjust')),
        Quantity      INT NOT NULL DEFAULT 1,
        LogDate       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        DueDate       DATETIME2 NULL,
        Notes         NVARCHAR(500) NULL
    );
    CREATE INDEX IX_Log_Item ON dbo.InventoryLogs(ItemID, LogDate);
    CREATE INDEX IX_Log_User ON dbo.InventoryLogs(UserID, LogDate);
END
GO

IF OBJECT_ID(N'dbo.SupplyRequests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SupplyRequests (
        RequestID         INT IDENTITY(1,1) PRIMARY KEY,
        RequestedByUserID   INT NOT NULL REFERENCES dbo.Users(UserID),
        ItemID              INT NULL REFERENCES dbo.Items(ItemID),
        ItemNameSnapshot    NVARCHAR(150) NOT NULL,
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
            OR (ItemID IS NULL AND NewItemName IS NOT NULL AND LEN(LTRIM(RTRIM(NewItemName))) > 0)
        )
    );
    CREATE INDEX IX_SupplyRequests_RequestedBy ON dbo.SupplyRequests (RequestedByUserID);
    CREATE INDEX IX_SupplyRequests_Status_Area ON dbo.SupplyRequests (Status, TargetAreaID);
END
GO

/* ---------- VIEWS & PROC ---------- */
CREATE OR ALTER VIEW dbo.vw_AreaDisplay AS
SELECT a.AreaID, a.SpaceID, a.AreaName,
       s.SpaceName + N' - ' + a.AreaName AS DisplayLabel
FROM dbo.Areas a
JOIN dbo.Spaces s ON s.SpaceID = a.SpaceID;
GO

CREATE OR ALTER VIEW dbo.vw_ValidAreaCategories AS
WITH Tree AS (
    SELECT CategoryID AS LeafCategoryID, CategoryID AS AncestorID
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

/* ---------- ROLE & TAXONOMY SEED (idempotent) ---------- */
INSERT INTO dbo.Roles (RoleName)
SELECT v.RoleName
FROM (VALUES (N'Admin'), (N'Full-time Lab Worker'), (N'Student Worker')) AS v(RoleName)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles r WHERE r.RoleName = v.RoleName);
GO

INSERT INTO dbo.Spaces (SpaceName)
SELECT v.SpaceName
FROM (VALUES (N'Makerspace'), (N'Project Room')) AS v(SpaceName)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Spaces s WHERE s.SpaceName = v.SpaceName);
GO

INSERT INTO dbo.Areas (SpaceID, AreaName)
SELECT s.SpaceID, a.AreaName
FROM (VALUES
    (N'Makerspace',   N'3D Printer Area'),
    (N'Makerspace',   N'Laser Cutter Area'),
    (N'Makerspace',   N'Shelf'),
    (N'Project Room', N'Shelf'),
    (N'Project Room', N'Side Shelves'),
    (N'Project Room', N'Wood Cutting Station')
) a(SpaceName, AreaName)
JOIN dbo.Spaces s ON s.SpaceName = a.SpaceName
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.Areas ar
    WHERE ar.SpaceID = s.SpaceID AND ar.AreaName = a.AreaName
);
GO

INSERT INTO dbo.Categories (ParentCategoryID, CategoryName)
SELECT NULL, v.CategoryName
FROM (VALUES
    (N'Flash Drives'), (N'Filament'), (N'Printer Parts'),
    (N'Laser Materials'), (N'Laser Add-ons'), (N'Printer Keys'),
    (N'Screwdrivers'), (N'Printer Ink'), (N'Batteries'),
    (N'Fixit Packs'), (N'Cables'), (N'Soldering Materials'),
    (N'Sockets'), (N'Drills'), (N'Impact Drivers'),
    (N'Impact Driver Heads'), (N'Saws'), (N'Masks'),
    (N'Glasses'), (N'Engines'),
    (N'Pressure Measurement Sets'), (N'Length Measurement Sets'),
    (N'Liquid Measurement Sets'), (N'Glass Soldering Sets'),
    (N'Glass Soldering Materials'),
    (N'Wood'), (N'Wood Holders')
) v(CategoryName)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.Categories c
    WHERE c.CategoryName = v.CategoryName AND c.ParentCategoryID IS NULL
);
GO

INSERT INTO dbo.Categories (ParentCategoryID, CategoryName)
SELECT p.CategoryID, c.Child
FROM (VALUES
    (N'Cables', N'HDMI'), (N'Cables', N'USB'), (N'Cables', N'Arduino'),
    (N'Wood', N'Plywood'), (N'Wood', N'Hardwood'), (N'Wood', N'Softwood'), (N'Wood', N'MDF')
) c(Parent, Child)
JOIN dbo.Categories p ON p.CategoryName = c.Parent AND p.ParentCategoryID IS NULL
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.Categories x
    WHERE x.ParentCategoryID = p.CategoryID AND x.CategoryName = c.Child
);
GO

INSERT INTO dbo.AreaCategories (AreaID, CategoryID)
SELECT a.AreaID, c.CategoryID
FROM (VALUES
    (N'Makerspace', N'3D Printer Area', N'Flash Drives'),
    (N'Makerspace', N'3D Printer Area', N'Filament'),
    (N'Makerspace', N'3D Printer Area', N'Printer Parts'),
    (N'Makerspace', N'Laser Cutter Area', N'Laser Materials'),
    (N'Makerspace', N'Laser Cutter Area', N'Laser Add-ons'),
    (N'Makerspace', N'Laser Cutter Area', N'Printer Keys'),
    (N'Makerspace', N'Shelf', N'Screwdrivers'),
    (N'Makerspace', N'Shelf', N'Printer Ink'),
    (N'Makerspace', N'Shelf', N'Batteries'),
    (N'Makerspace', N'Shelf', N'Fixit Packs'),
    (N'Makerspace', N'Shelf', N'Cables'),
    (N'Makerspace', N'Shelf', N'Soldering Materials'),
    (N'Project Room', N'Shelf', N'Sockets'),
    (N'Project Room', N'Shelf', N'Drills'),
    (N'Project Room', N'Shelf', N'Impact Drivers'),
    (N'Project Room', N'Shelf', N'Impact Driver Heads'),
    (N'Project Room', N'Shelf', N'Saws'),
    (N'Project Room', N'Shelf', N'Masks'),
    (N'Project Room', N'Shelf', N'Glasses'),
    (N'Project Room', N'Shelf', N'Engines'),
    (N'Project Room', N'Side Shelves', N'Pressure Measurement Sets'),
    (N'Project Room', N'Side Shelves', N'Length Measurement Sets'),
    (N'Project Room', N'Side Shelves', N'Liquid Measurement Sets'),
    (N'Project Room', N'Side Shelves', N'Glass Soldering Sets'),
    (N'Project Room', N'Side Shelves', N'Glass Soldering Materials'),
    (N'Project Room', N'Wood Cutting Station', N'Wood'),
    (N'Project Room', N'Wood Cutting Station', N'Saws'),
    (N'Project Room', N'Wood Cutting Station', N'Wood Holders')
) m(SpaceName, AreaName, CategoryName)
JOIN dbo.Spaces s ON s.SpaceName = m.SpaceName
JOIN dbo.Areas a ON a.SpaceID = s.SpaceID AND a.AreaName = m.AreaName
JOIN dbo.Categories c ON c.CategoryName = m.CategoryName AND c.ParentCategoryID IS NULL
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.AreaCategories ac
    WHERE ac.AreaID = a.AreaID AND ac.CategoryID = c.CategoryID
);
GO