// Shared helpers for the Inventory and Supply Requests pages.
// Load this before the page's own script:
//   <script src="js/notices.js"></script>
// The page needs a <p id="page-message" class="notice" role="status" style="display: none;"></p>

// makes typed-in text safe to put inside innerHTML (so "<b>" shows as text, not HTML)
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// green (type "success") or red (type "error") message that hides after 4 seconds
function showNotice(message, type) {
  const notice = document.getElementById("page-message");
  notice.textContent = message;
  notice.className = `notice notice--${type}`;
  notice.style.display = "block";
  clearTimeout(showNotice._t);
  showNotice._t = setTimeout(() => { notice.style.display = "none"; }, 4000);
}
