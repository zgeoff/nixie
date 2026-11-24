// Dispatches a paste of the text onto the take-over screen, as the browser does when the user pastes
// while the screen has focus.
export async function pasteIntoScreen(view: Bun.WebView, text: string): Promise<void> {
  await view.evaluate(`(() => {
    const data = new DataTransfer();
    data.setData('text/plain', ${JSON.stringify(text)});
    document.querySelector('main [role="img"] canvas').dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  })()`);
}
