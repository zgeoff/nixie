# The browser image: Bun, the headless-only Chromium build that Playwright installs, and the browser
# guest bundled into one file beside Playwright's own package. Build it into impd from the repo
# root. impd refuses a FROM that names its image with a variable, so each FROM writes out the Bun
# version in .bun-version.

FROM oven/bun:1.4.4 AS build
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts \
  && bun build guests/browser/src/main.ts --target bun --external playwright-core --outfile /out/browser.js \
  && cp -rL node_modules/.bun/playwright-core@*/node_modules/playwright-core /out/playwright-core

FROM oven/bun:1.4.4
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
COPY --from=build /out/playwright-core /app/node_modules/playwright-core
RUN bun /app/node_modules/playwright-core/cli.js install --with-deps chromium-headless-shell \
  && rm -rf /var/lib/apt/lists/* \
  && chmod -R a+rX /opt/browsers
COPY --from=build /out/browser.js /app/browser.js
USER bun
ENTRYPOINT ["/usr/local/bin/bun", "/app/browser.js"]
