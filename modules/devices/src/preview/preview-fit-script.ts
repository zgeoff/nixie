// The page's one script. It grows the text of each fitting box to the largest size at which it fits,
// as the device page does, then tells the render that the page is ready.
export const previewFitScript = `
for (const box of document.querySelectorAll('[data-fit]')) {
  const content = box.firstElementChild;
  const width = box.clientWidth;
  const height = box.clientHeight;

  if (content === null || width === 0 || height === 0) {
    continue;
  }

  let low = 1;
  let high = Math.max(1, height);

  for (let step = 0; step < 12; step += 1) {
    const middle = (low + high) / 2;

    content.style.fontSize = middle + 'px';

    if (content.scrollWidth <= width && content.scrollHeight <= height) {
      low = middle;
    } else {
      high = middle;
    }
  }

  content.style.fontSize = low + 'px';
}

document.fonts.ready.then(() => {
  window.__nixieReady = true;
});
`;
