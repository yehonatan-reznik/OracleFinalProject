(() => {
  const host = window.location.hostname;
  const isLocal = !host || host === "localhost" || host === "127.0.0.1";

  window.APP_CONFIG = {
    apiBaseUrl: isLocal
      ? "http://localhost:3001/api"
      : "http://151.145.89.235:3001/api",
  };
})();
