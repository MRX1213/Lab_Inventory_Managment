# Optional data fixes (manual)

Run these only when you understand the impact on your local database. They are **not** applied automatically by migrations or QA seed re-runs.

## Cordless Drill — wrong category on old QA databases

Earlier QA seed inserted `Cordless Drill` with **Printer Parts** in **Project Room / Shelf**, which is not mapped in `AreaCategories`. The inventory list hides that row; the dashboard used to count it anyway (fixed in API). New seeds use **Drills**.

To repair an existing row (verify IDs first in your DB):

```sql
USE LabInventory;
DECLARE @Drills INT = (
  SELECT CategoryID FROM dbo.Categories WHERE CategoryName = N'Drills' AND ParentCategoryID IS NULL
);
UPDATE dbo.Items
SET CategoryID = @Drills
WHERE ItemName = N'Cordless Drill'
  AND CategoryID <> @Drills;
```

Do not run this on shared production data without team approval.