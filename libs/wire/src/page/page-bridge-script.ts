// The script that opens each page's frame: it defines the one global a page sees, `nixie`, and talks
// to the device page around the frame by postMessage. `__IMAGES__` and `__INITIAL__` are filled
// in by the frame builder.
export const pageBridgeScript = `(function () {
  var images = __IMAGES__;
  var handlers = [];
  var buffer = __INITIAL__;
  var parentWindow = window.parent;

  // The guards below call only these built-ins, taken before the page's script runs, so a page that
  // replaces a built-in can't change what a guard does.
  var apply = Reflect.apply;
  var defineProperty = Object.defineProperty;
  var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  var toLowerCase = String.prototype.toLowerCase;
  var indexOf = String.prototype.indexOf;
  var lastIndexOf = String.prototype.lastIndexOf;
  var slice = String.prototype.slice;
  var charAt = String.prototype.charAt;
  var TypeErrorType = TypeError;

  // No content-security policy stops a link element's resource hint: a preconnect opens a
  // connection under connect-src 'none'. A peer connection reaches any server a page names, a frame
  // inside the page would give it a window with none of these guards, and an XSLT transform builds
  // elements by name. The page gets none of them.
  ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection', 'XSLTProcessor'].forEach(function (name) {
    try {
      delete window[name];
    } catch (error) {}
  });

  // true for the name of a link, frame, object or embed element, with or without a namespace prefix
  function isBlockedName(name) {
    var lower = apply(toLowerCase, name, []);
    var local = apply(slice, lower, [apply(lastIndexOf, lower, [':']) + 1]);
    return local === 'link' || local === 'iframe' || local === 'frame' || local === 'object' || local === 'embed';
  }

  function isNameEnd(character) {
    return character === ' ' || character === '\\t' || character === '\\n' || character === '\\f' ||
      character === '\\r' || character === '/' || character === '>';
  }

  // The markup with each start tag of a blocked element turned into a span. A tag name runs to the
  // first space, slash or closing bracket, as the HTML and XML parsers read it.
  function clean(markup) {
    var text = '' + markup;
    var cleaned = '';
    var copied = 0;
    var start = apply(indexOf, text, ['<']);
    while (start !== -1) {
      var end = start + 1;
      while (end < text.length && !isNameEnd(apply(charAt, text, [end]))) {
        end += 1;
      }
      if (isBlockedName(apply(slice, text, [start + 1, end]))) {
        cleaned += apply(slice, text, [copied, start]) + '<span';
        copied = end;
      }
      start = apply(indexOf, text, ['<', start + 1]);
    }
    return cleaned + apply(slice, text, [copied]);
  }

  function pickName(name) {
    var text = '' + name;
    return isBlockedName(text) ? 'span' : text;
  }

  var createElement = Document.prototype.createElement;
  var createElementNS = Document.prototype.createElementNS;
  var createDocument = DOMImplementation.prototype.createDocument;
  Document.prototype.createElement = function (name, options) {
    return apply(createElement, this, [pickName(name), options]);
  };
  Document.prototype.createElementNS = function (namespace, name, options) {
    return apply(createElementNS, this, [namespace, pickName(name), options]);
  };
  DOMImplementation.prototype.createDocument = function (namespace, name, doctype) {
    return apply(createDocument, this, [namespace, name === null ? '' : pickName(name), doctype]);
  };

  // A page could split a start tag across two writes, which no cleaning of each write sees, so a
  // page can't write into its document.
  function refuseWrite() {
    throw new TypeErrorType('a page cannot write into its document');
  }

  // A browser with trusted types sends each string of markup through a default policy, which no
  // script can replace, and which refuses a write before the browser parses it. One without them
  // gets the same cleaning and refusal at each place that turns a string into markup.
  function wrapSetter(prototype, property) {
    var descriptor = getOwnPropertyDescriptor(prototype, property);
    if (!descriptor || !descriptor.set) {
      return;
    }
    var set = descriptor.set;
    defineProperty(prototype, property, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set: function (value) {
        apply(set, this, [clean(value)]);
      },
    });
  }

  function wrapMethod(owner, method, first, last) {
    var original = owner[method];
    if (typeof original !== 'function') {
      return;
    }
    owner[method] = function () {
      var args = [];
      for (var index = 0; index < arguments.length; index += 1) {
        defineProperty(args, index, {
          value: index >= first && index <= last ? clean(arguments[index]) : arguments[index],
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      return apply(original, this, args);
    };
  }

  if (window.trustedTypes) {
    window.trustedTypes.createPolicy('default', {
      createHTML: function (markup, type, sink) {
        if (sink === 'Document write' || sink === 'Document writeln') {
          refuseWrite();
        }
        return clean(markup);
      },
      createScript: function (script) {
        return script;
      },
      createScriptURL: function () {
        throw new TypeErrorType('a page cannot load a script by its address');
      },
    });
  } else {
    Document.prototype.write = refuseWrite;
    Document.prototype.writeln = refuseWrite;
    ['innerHTML', 'outerHTML'].forEach(function (property) {
      wrapSetter(Element.prototype, property);
    });
    if (window.ShadowRoot) {
      wrapSetter(ShadowRoot.prototype, 'innerHTML');
    }
    wrapSetter(HTMLIFrameElement.prototype, 'srcdoc');
    wrapMethod(Element.prototype, 'insertAdjacentHTML', 1, 1);
    wrapMethod(Element.prototype, 'setHTMLUnsafe', 0, 0);
    wrapMethod(Element.prototype, 'setHTML', 0, 0);
    if (window.ShadowRoot) {
      wrapMethod(ShadowRoot.prototype, 'setHTMLUnsafe', 0, 0);
    }
    wrapMethod(Document, 'parseHTMLUnsafe', 0, 0);
    wrapMethod(DOMParser.prototype, 'parseFromString', 0, 0);
    wrapMethod(Range.prototype, 'createContextualFragment', 0, 0);

    var setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      var attribute = '' + name;
      return apply(setAttribute, this, [
        attribute,
        apply(toLowerCase, attribute, []) === 'srcdoc' ? clean(value) : value,
      ]);
    };
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
