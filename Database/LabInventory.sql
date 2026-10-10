CREATE DATABASE LabInventory;
GO
USE LabInventory;
GO
 
/* ---------- USERS & ROLES ---------- */
CREATE TABLE Roles (
    RoleID      INT IDENTITY(1,1) PRIMARY KEY,
    RoleName    NVARCHAR(50) NOT NULL UNIQUE
);
 
CREATE TABLE Users (
    UserID      INT IDENTITY(1,1) PRIMARY KEY,
    FirstName   NVARCHAR(100) NOT NULL,
    LastName    NVARCHAR(100) NOT NULL,
    Email       NVARCHAR(255) NOT NULL UNIQUE,
    RoleID      INT NOT NULL REFERENCES Roles(RoleID),
    IsActive    BIT NOT NULL DEFAULT 1,
    CreatedAt   DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
 
/* ---------- LOCATIONS ---------- */
CREATE TABLE Spaces (
    SpaceID     INT IDENTITY(1,1) PRIMARY KEY,
    SpaceName   NVARCHAR(100) NOT NULL UNIQUE
);
 
CREATE TABLE Areas (
    AreaID      INT IDENTITY(1,1) PRIMARY KEY,
    SpaceID     INT NOT NULL REFERENCES Spaces(SpaceID),
    AreaName    NVARCHAR(100) NOT NULL,
    CONSTRAINT UQ_Areas UNIQUE (SpaceID, AreaName)
);
 
/* ---------- CATEGORIES (tree: Cables -> HDMI, USB, ...) ---------- */
CREATE TABLE Categories (
    CategoryID       INT IDENTITY(1,1) PRIMARY KEY,
    ParentCategoryID INT NULL REFERENCES Categories(CategoryID),
    CategoryName     NVARCHAR(100) NOT NULL,
    CONSTRAINT UQ_Categories UNIQUE (ParentCategoryID, CategoryName)
);
 
-- Which categories live in which area (many-to-many)
CREATE TABLE AreaCategories (
    AreaID      INT NOT NULL REFERENCES Areas(AreaID),
    CategoryID  INT NOT NULL REFERENCES Categories(CategoryID),
    PRIMARY KEY (AreaID, CategoryID)
);
 
/* ---------- ITEMS ---------- */
CREATE TABLE Items (
    ItemID          INT IDENTITY(1,1) PRIMARY KEY,
    ItemName        NVARCHAR(150) NOT NULL,
    CategoryID      INT NOT NULL REFERENCES Categories(CategoryID),
    AreaID          INT NOT NULL REFERENCES Areas(AreaID),
    -- 'Unit' = tracked individually (printer key, drill, flash drive)
    -- 'Bulk' = tracked by quantity (filament, batteries, ink)
    TrackingType    VARCHAR(10) NOT NULL DEFAULT 'Unit'
                    CHECK (TrackingType IN ('Unit','Bulk')),
    QuantityOnHand  INT NOT NULL DEFAULT 1 CHECK (QuantityOnHand >= 0),
    ReorderLevel    INT NULL,
    AssetTag        NVARCHAR(50) NULL,
    Status          VARCHAR(20) NOT NULL DEFAULT 'Available'
                    CHECK (Status IN ('Available','CheckedOut','Broken','Lost','Retired')),
    Notes           NVARCHAR(500) NULL,
    CreatedAt       DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
-- AssetTag unique only when present
CREATE UNIQUE INDEX UX_Items_AssetTag ON Items(AssetTag) WHERE AssetTag IS NOT NULL;
CREATE INDEX IX_Items_Category ON Items(CategoryID);
CREATE INDEX IX_Items_Area     ON Items(AreaID);
 
/* ---------- TRANSACTIONS ---------- */
CREATE TABLE InventoryTransactions (
    TransactionID   BIGINT IDENTITY(1,1) PRIMARY KEY,
    ItemID          INT NOT NULL REFERENCES Items(ItemID),
    UserID          INT NOT NULL REFERENCES Users(UserID),      -- who took/returned/used it
    ProcessedByID   INT NULL REFERENCES Users(UserID),          -- worker who handled it
    TransactionType VARCHAR(15) NOT NULL
                    CHECK (TransactionType IN ('CheckOut','CheckIn','Consume','Restock','Adjust')),
    Quantity        INT NOT NULL DEFAULT 1,
    TransactionDate DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    DueDate         DATETIME2 NULL,
    Notes           NVARCHAR(500) NULL
);
CREATE INDEX IX_Trans_Item ON InventoryTransactions(ItemID, TransactionDate);
CREATE INDEX IX_Trans_User ON InventoryTransactions(UserID, TransactionDate);
GO
 
/* ============================================================
   SEED DATA
   ============================================================ */
 
INSERT INTO Roles (RoleName) VALUES ('Admin'), ('LabWorker'), ('FullTimeLabWorker');
 
INSERT INTO Spaces (SpaceName) VALUES ('Makerspace'), ('Project Room');
 
INSERT INTO Areas (SpaceID, AreaName)
SELECT s.SpaceID, a.AreaName
FROM (VALUES
    ('Makerspace',   '3D Printer Area'),
    ('Makerspace',   'Laser Cutter Area'),
    ('Makerspace',   'Shelf'),
    ('Project Room', 'Shelf'),
    ('Project Room', 'Side Shelves'),
    ('Project Room', 'Wood Cutting Station')
) a(SpaceName, AreaName)
JOIN Spaces s ON s.SpaceName = a.SpaceName;
 
/* ---------- Top-level categories ---------- */
INSERT INTO Categories (ParentCategoryID, CategoryName) VALUES
 -- 3D printer
 (NULL,'Flash Drives'), (NULL,'Filament'), (NULL,'Printer Parts'),
 -- Laser cutter
 (NULL,'Laser Materials'), (NULL,'Laser Add-ons'), (NULL,'Printer Keys'),
 -- Shared / shelf
 (NULL,'Screwdrivers'), (NULL,'Printer Ink'), (NULL,'Batteries'),
 (NULL,'Fixit Packs'), (NULL,'Cables'), (NULL,'Soldering Materials'),
 (NULL,'Sockets'), (NULL,'Drills'), (NULL,'Impact Drivers'),
 (NULL,'Impact Driver Heads'), (NULL,'Saws'), (NULL,'Masks'),
 (NULL,'Glasses'), (NULL,'Engines'),
 -- Side shelves
 (NULL,'Pressure Measurement Sets'), (NULL,'Length Measurement Sets'),
 (NULL,'Liquid Measurement Sets'), (NULL,'Glass Soldering Sets'),
 (NULL,'Glass Soldering Materials'),
 -- Wood station
 (NULL,'Wood'), (NULL,'Wood Holders');
 
/* ---------- Sub-categories ---------- */
INSERT INTO Categories (ParentCategoryID, CategoryName)
SELECT p.CategoryID, c.Child
FROM (VALUES
    ('Cables','HDMI'), ('Cables','USB'), ('Cables','Arduino'),
    ('Wood','Plywood'), ('Wood','Hardwood'), ('Wood','Softwood'), ('Wood','MDF')
) c(Parent, Child)
JOIN Categories p ON p.CategoryName = c.Parent AND p.ParentCategoryID IS NULL;
 
/* ---------- Link categories to areas ---------- */
INSERT INTO AreaCategories (AreaID, CategoryID)
SELECT a.AreaID, c.CategoryID
FROM (VALUES
    ('Makerspace','3D Printer Area','Flash Drives'),
    ('Makerspace','3D Printer Area','Filament'),
    ('Makerspace','3D Printer Area','Printer Parts'),
    ('Makerspace','Laser Cutter Area','Laser Materials'),
    ('Makerspace','Laser Cutter Area','Laser Add-ons'),
    ('Makerspace','Laser Cutter Area','Printer Keys'),
    ('Makerspace','Shelf','Screwdrivers'),
    ('Makerspace','Shelf','Printer Ink'),
    ('Makerspace','Shelf','Batteries'),
    ('Makerspace','Shelf','Fixit Packs'),
    ('Makerspace','Shelf','Cables'),
    ('Makerspace','Shelf','Soldering Materials'),
    ('Project Room','Shelf','Sockets'),
    ('Project Room','Shelf','Drills'),
    ('Project Room','Shelf','Impact Drivers'),
    ('Project Room','Shelf','Impact Driver Heads'),
    ('Project Room','Shelf','Saws'),
    ('Project Room','Shelf','Masks'),
    ('Project Room','Shelf','Glasses'),
    ('Project Room','Shelf','Engines'),
    ('Project Room','Side Shelves','Pressure Measurement Sets'),
    ('Project Room','Side Shelves','Length Measurement Sets'),
    ('Project Room','Side Shelves','Liquid Measurement Sets'),
    ('Project Room','Side Shelves','Glass Soldering Sets'),
    ('Project Room','Side Shelves','Glass Soldering Materials'),
    ('Project Room','Wood Cutting Station','Wood'),
    ('Project Room','Wood Cutting Station','Saws'),
    ('Project Room','Wood Cutting Station','Wood Holders')
) m(SpaceName, AreaName, CategoryName)
JOIN Spaces s     ON s.SpaceName = m.SpaceName
JOIN Areas a      ON a.SpaceID = s.SpaceID AND a.AreaName = m.AreaName
JOIN Categories c ON c.CategoryName = m.CategoryName AND c.ParentCategoryID IS NULL;
GO
 
