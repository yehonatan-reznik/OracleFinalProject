(() => {
  const config = window.APP_CONFIG || {};
  const apiBaseUrl = config.apiBaseUrl || "";

  const getToken = () => localStorage.getItem("token");
  const getWarehouseContext = () => ({
    company_id: localStorage.getItem("company_id"),
    company_name: localStorage.getItem("company_name"),
    warehouse_id: localStorage.getItem("warehouse_id"),
    warehouse_name: localStorage.getItem("warehouse_name"),
  });

  const requireAuth = (redirectTo) => {
    if (!getToken()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  };

  const logout = () => {
    localStorage.clear();
    window.location.href = "index.html";
  };

  const buildUrl = (base, path) => {
    const baseUrl = (base || "").replace(/\/+$/, "");
    let nextPath = path || "";
    if (baseUrl.endsWith("/api") && nextPath.startsWith("/api")) {
      nextPath = nextPath.slice(4);
      if (!nextPath.startsWith("/")) {
        nextPath = `/${nextPath}`;
      }
    }
    return `${baseUrl}${nextPath}`;
  };

  const apiFetch = async (path, options = {}) => {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(buildUrl(apiBaseUrl, path), {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = "Request failed";
      try {
        const errorBody = await response.json();
        errorMessage = errorBody.error || errorBody.message || errorMessage;
      } catch (err) {
        // ignore parse errors
      }
      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  };

  window.App = {
    apiBaseUrl,
    getToken,
    getWarehouseContext,
    requireAuth,
    logout,
    apiFetch,
  };
})();
