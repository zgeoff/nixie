// Shared by every page: registers the service worker, calls the server the way the service worker
// does, and renders the server's results log.
const probe = {
  clientHeaders: { 'content-type': 'application/json', 'x-nixie-client': 'probe-page' },

  async start() {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.register('/sw.js');
    }

    const config = await (await fetch('/api/config')).json();
    const sessionLine = document.querySelector('#session');

    if (sessionLine) {
      sessionLine.textContent = `Session: ${config.session ?? 'none, reload the page'}`;
    }

    return config;
  },

  async post(path, body, headers = probe.clientHeaders) {
    const response = await fetch(path, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const text = await response.text();

    return `${response.status} ${text}`;
  },

  show(selector, text) {
    document.querySelector(selector).textContent = text;
  },

  async renderLog(kinds, headers = {}) {
    const list = document.querySelector('#log');
    const response = await fetch('/api/log', { headers });

    if (!response.ok) {
      list.replaceChildren(probe.item(`log refused: ${response.status}`));

      return;
    }

    const entries = (await response.json()).filter((entry) => kinds.includes(entry.kind));

    list.replaceChildren(
      ...entries.map((entry) =>
        probe.item(
          `${entry.at} ${entry.session ?? 'no session'} ${entry.kind}\n${JSON.stringify(entry.detail, null, 1)}`,
        ),
      ),
    );

    if (entries.length === 0) {
      list.replaceChildren(probe.item('nothing recorded yet'));
    }
  },

  item(text) {
    const item = document.createElement('li');

    item.textContent = text;

    return item;
  },

  pollLog(kinds, headers) {
    void probe.renderLog(kinds, headers);
    setInterval(() => void probe.renderLog(kinds, headers), 3000);
  },
};
