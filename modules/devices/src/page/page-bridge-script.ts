// The script that opens each page's frame: it defines the one global a page sees, `nixie`, and talks
// to the device page around the frame by postMessage. `__IMAGES__` and `__INITIAL__` are filled
// in by the frame builder.
export const pageBridgeScript = `(function () {
  var images = __IMAGES__;
  var handlers = [];
  var buffer = __INITIAL__;
  var parentWindow = window.parent;

  // The frame's policy leaves two ways out that it cannot close: a peer connection reaches any
  // server a page names, and a link element opens a connection from a resource hint. The page
  // gets neither, and the default trusted-types policy cleans every string it turns into markup.
  ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection'].forEach(function (name) {
    try {
      delete window[name];
    } catch (error) {}
  });

  var createElement = Document.prototype.createElement;
  var createElementNS = Document.prototype.createElementNS;
  var linkTag = /^link$/i;
  Document.prototype.createElement = function (name) {
    return createElement.call(this, linkTag.test(String(name)) ? 'span' : name, arguments[1]);
  };
  Document.prototype.createElementNS = function (namespace, name) {
    return createElementNS.call(this, namespace, linkTag.test(String(name)) ? 'span' : name, arguments[2]);
  };

  var linkMarkup = /<link(?![\\w-])/gi;
  function clean(markup) {
    return String(markup).replace(linkMarkup, '<span');
  }
  if (window.trustedTypes) {
    window.trustedTypes.createPolicy('default', {
      createHTML: clean,
      createScript: function (script) {
        return script;
      },
      createScriptURL: function () {
        throw new TypeError('a page cannot load a script by its address');
      },
    });
  }

  function post(message) {
    message.nixie = true;
    parentWindow.postMessage(message, '*');
  }

  function refuse() {
    var error = new Error('NOT_DECLARED');
    error.code = 'NOT_DECLARED';
    return error;
  }

  function receive(data) {
    if (handlers.length === 0) {
      buffer.push(data);
      return;
    }
    handlers.slice().forEach(function (handler) {
      try {
        handler(data);
      } catch (error) {
        post({ type: 'error', message: String(error && error.stack ? error.stack : error) });
      }
    });
  }

  window.addEventListener('message', function (event) {
    var message = event.data;
    if (event.source !== parentWindow || !message || message.nixie !== true) {
      return;
    }
    if (message.type === 'message') {
      receive(message.data);
    }
  });

  window.addEventListener('error', function (event) {
    post({ type: 'error', message: String(event.message || 'Uncaught error') });
  });

  window.addEventListener('unhandledrejection', function (event) {
    post({ type: 'error', message: 'Unhandled rejection: ' + String(event.reason) });
  });

  var logError = console.error;
  console.error = function () {
    post({ type: 'error', message: Array.prototype.map.call(arguments, String).join(' ') });
    return logError.apply(console, arguments);
  };

  // A touch inside the frame never reaches the device page, so the bridge tells it, at most 4 times
  // a second. The listener is the first on the window and sees the event before any the page adds.
  var lastTouchAt = 0;
  function touch() {
    var now = Date.now();
    if (now - lastTouchAt >= 250) {
      lastTouchAt = now;
      post({ type: 'touch' });
    }
  }
  window.addEventListener('pointerdown', touch, true);
  window.addEventListener('pointermove', touch, true);

  window.addEventListener('load', function () {
    post({ type: 'ready' });
  });

  Object.defineProperty(window, 'nixie', {
    value: Object.freeze({
      send: function (name, data, options) {
        var message = { type: 'event', name: String(name), wake: !!(options && options.wake === true) };
        if (data !== undefined) {
          message.data = JSON.parse(JSON.stringify(data));
        }
        post(message);
      },
      onMessage: function (handler) {
        handlers.push(handler);
        var waiting = buffer;
        buffer = [];
        waiting.forEach(receive);
      },
      data: function () {
        return Promise.reject(refuse());
      },
      onData: function () {},
      size: function () {
        return { width: window.innerWidth, height: window.innerHeight };
      },
      image: function (image) {
        if (!Object.prototype.hasOwnProperty.call(images, image)) {
          throw refuse();
        }
        return images[image];
      },
    }),
  });
})();`;
