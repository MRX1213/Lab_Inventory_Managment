(async function () {
  await window.labAuthReady;

  const totalEl = document.getElementById("total-items");
  const lowEl = document.getElementById("low-stock");
  const outEl = document.getElementById("out-of-stock");
  const pendingEl = document.getElementById("pending-count");
  const approvedEl = document.getElementById("approved-count");
  const rejectedEl = document.getElementById("rejected-count");
  const recentList = document.getElementById("recent-changes-list");

  totalEl.textContent = "…";
  lowEl.textContent = "…";
  outEl.textContent = "…";

  try {
    const { data: spaces } = await window.labApi.apiFetch("/spaces");
    const makerspace = spaces.spaces.find((s) => s.spaceName === "Makerspace") || spaces.spaces[0];
    if (!makerspace) {
      totalEl.textContent = "0";
      lowEl.textContent = "0";
      outEl.textContent = "0";
      return;
    }
    const { data: summary } = await window.labApi.apiFetch(
      `/dashboard/summary?spaceId=${makerspace.spaceId}`,
    );
    const t = summary.totals || {};
    totalEl.textContent = String(t.itemRecordCount ?? 0);
    lowEl.textContent = String(t.lowStockItemCount ?? 0);
    outEl.textContent = String(t.outOfStockItemCount ?? 0);
    const rc = summary.requestStatusCounts || {};
    pendingEl.textContent = String(rc.pending ?? 0);
    approvedEl.textContent = String(rc.approved ?? 0);
    rejectedEl.textContent = String(rc.rejected ?? 0);

    const { data: logs } = await window.labApi.apiFetch("/inventory-logs?limit=10");
    recentList.innerHTML = "";
    if (!logs.logs.length) {
      recentList.innerHTML = "<li>No recent changes yet.</li>";
      return;
    }
    logs.logs.forEach((log) => {
      const li = document.createElement("li");
      const when = log.logDate ? new Date(log.logDate).toLocaleString() : "";
      li.textContent = `${when} — ${log.itemName}: ${log.logType} (${log.quantity}) by ${log.userName}`;
      recentList.appendChild(li);
    });
  } catch (e) {
    totalEl.textContent = "!";
    recentList.innerHTML = `<li>Could not load dashboard: ${e.message}</li>`;
  }
})();