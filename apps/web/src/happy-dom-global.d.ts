import type { Window } from 'happy-dom';

// the test preload registers happy-dom's window as the global object, which carries happy-dom's own
// API beside the browser's
declare global {
  var happyDOM: Window['happyDOM'];
}
