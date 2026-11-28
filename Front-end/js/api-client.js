(function () {
  let csrfToken = null;

  async function parseJson(res) {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async function apiFetch(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    if (csrfToken && options.method && options.method !== "GET") {
      headers["X-CSRF-Token"] = csrfToken;
    }
    const res = await fetch(`${window.API_BASE || ""}/api${path}`, {
      credentials: "include",
      ...options,
      headers,
      body:
        options.body && typeof options.body !== "string"
          ? JSON.stringify(options.body)
          : options.body,
    });
    if (res.status === 401 && !path.startsWith("/auth/login")) {
      if (!window.USE_MOCK_API) window.location.href = "login.html";
      throw new Error("Unauthorized");
    }
    const data = await parseJson(res);
    if (!res.ok) {
      const err = new Error(data?.error || res.statusText);
      err.status = res.status;
      err.code = data?.code;
      err.payload = data;
      throw err;
    }
    return { res, data };
  }

  window.labApi = {
    apiFetch,
    setCsrfToken(token) {
      csrfToken = token;
    },
    getCsrfToken() {
      return csrfToken;
    },
  };
})();