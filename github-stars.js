(function () {
  "use strict";

  const refreshInterval = 5 * 60 * 1000;
  const requestTimeout = 8000;
  const cachePrefix = "yiming-github-stars:";
  const numberFormat = new Intl.NumberFormat("en-US");
  const links = document.querySelectorAll("[data-github-repo]");
  let pausedUntil = 0;
  let refreshTimer;
  let refreshing = false;

  try {
    const savedPause = Number(localStorage.getItem(cachePrefix + "retry-after"));
    if (Number.isFinite(savedPause)) pausedUntil = savedPause;
  } catch (_) {
    // Rate-limit backoff can still be kept in memory without storage.
  }

  function validCount(cached) {
    return (Number.isSafeInteger(cached.count) && cached.count >= 0) ||
      (cached.source === "Shields.io" && typeof cached.count === "string" &&
        /^(?:\d+|\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?[kMBT])$/.test(cached.count));
  }

  function readCache(repo) {
    try {
      const cached = JSON.parse(localStorage.getItem(cachePrefix + repo));
      if (
        cached &&
        validCount(cached) &&
        Number.isFinite(cached.updatedAt) && cached.updatedAt > 0 &&
        cached.updatedAt <= Date.now()
      ) return cached;
    } catch (_) {
      // Storage may be disabled, including when the site is opened as a file.
    }
    return null;
  }

  function render(state, status) {
    const { link, counter, repo, cached } = state;
    let description = repo + " on GitHub";
    if (cached) {
      const count = typeof cached.count === "number" ? numberFormat.format(cached.count) : cached.count;
      counter.textContent = count;
      description += "; " + count + " stars";
      if (cached.source === "Shields.io") description += " via Shields.io (may be rounded or delayed)";
      description += ". Last checked " +
        new Date(cached.updatedAt).toLocaleString("en-US") + ".";
      if (status === "unavailable") description += " Showing cached count; refresh unavailable.";
    } else {
      counter.textContent = "-";
      description += status === "loading" ? "; loading stars." : "; star count unavailable.";
    }
    link.title = description;
    link.setAttribute("aria-label", description);
    link.dataset.starsStatus = status;
  }

  const states = Array.from(links).flatMap(function (link) {
    const repo = link.dataset.githubRepo;
    const counter = link.querySelector("[data-star-count]");
    if (!counter || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return [];
    return [{ link, counter, repo, cached: readCache(repo), pending: false, nextAttempt: 0 }];
  });

  async function request(url, github) {
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, requestTimeout);
    try {
      const response = await fetch(url, {
        headers: { Accept: github ? "application/vnd.github+json" : "application/json" },
        credentials: "omit",
        cache: "no-cache",
        signal: controller.signal,
      });
      if (github && (response.status === 403 || response.status === 429)) {
        const resetAt = Number(response.headers.get("X-RateLimit-Reset")) * 1000;
        const retryAt = Date.now() + Number(response.headers.get("Retry-After")) * 1000;
        pausedUntil = Math.max(pausedUntil, Date.now() + refreshInterval,
          Number.isFinite(resetAt) ? resetAt : 0,
          Number.isFinite(retryAt) ? retryAt : 0);
        try {
          localStorage.setItem(cachePrefix + "retry-after", String(pausedUntil));
        } catch (_) {
          // A reload may retry earlier when storage is disabled.
        }
      }
      if (!response.ok) throw new Error("Star service response " + response.status);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function update(state) {
    if (state.pending || Date.now() < state.nextAttempt) return;

    const sharedCache = readCache(state.repo);
    if (sharedCache && (!state.cached || sharedCache.updatedAt > state.cached.updatedAt)) {
      state.cached = sharedCache;
    }
    if (state.cached && Date.now() - state.cached.updatedAt < refreshInterval) {
      render(state, "cached");
      return;
    }

    state.pending = true;
    render(state, "loading");
    try {
      let cached;
      try {
        if (Date.now() < pausedUntil) throw new Error("GitHub rate limit backoff");
        const data = await request("https://api.github.com/repos/" + state.repo, true);
        if (!Number.isSafeInteger(data.stargazers_count) || data.stargazers_count < 0) {
          throw new Error("Missing GitHub star count");
        }
        cached = { count: data.stargazers_count, updatedAt: Date.now() };
      } catch (_) {
        if (document.hidden) throw new Error("Refresh paused while page is hidden");
        // A public badge service also works on networks sharing an exhausted GitHub quota.
        const badge = await request("https://img.shields.io/github/stars/" + state.repo + ".json", false);
        cached = { count: badge.value, source: "Shields.io", updatedAt: Date.now() };
        if (!validCount(cached)) throw new Error("Missing Shields.io star count");
      }
      state.cached = cached;
      try {
        localStorage.setItem(cachePrefix + state.repo, JSON.stringify(state.cached));
      } catch (_) {
        // Live counts still work when persistent storage is unavailable.
      }
      render(state, "updated");
    } catch (_) {
      render(state, "unavailable");
    } finally {
      state.pending = false;
      state.nextAttempt = document.hidden ? 0 : Date.now() + refreshInterval;
    }
  }

  async function refresh() {
    clearTimeout(refreshTimer);
    if (document.hidden || refreshing) return;
    refreshing = true;
    try {
      await Promise.all(states.map(update));
    } finally {
      refreshing = false;
      const nextUpdate = Math.min(...states.map(function (state) {
        return Math.max(state.nextAttempt, state.cached ? state.cached.updatedAt + refreshInterval : 0);
      }));
      refreshTimer = setTimeout(refresh, Math.max(1000, nextUpdate - Date.now()));
    }
  }

  if (!states.length) return;
  states.forEach(function (state) { render(state, state.cached ? "cached" : "loading"); });
  refresh();
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("online", function () {
    states.forEach(function (state) {
      if (state.link.dataset.starsStatus === "unavailable") state.nextAttempt = 0;
    });
    refresh();
  });
})();
