// Adds one of Google's scripts to the page and waits for it to load. A page that holds the script
// already, such as one that a test stubbed, waits for nothing.
export function loadGoogleScript(source: string, isLoaded: () => boolean): Promise<void> {
  if (isLoaded()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');

    script.setAttribute('src', source);

    script.async = true;

    script.addEventListener('load', () => {
      resolve();
    });

    script.addEventListener('error', () => {
      reject(new Error('Google did not load. Check that the browser can reach Google.'));
    });

    document.head.append(script);
  });
}
