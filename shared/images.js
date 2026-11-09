/*
 * Broken-image guard. An image whose load failed is marked data-se-img-broken until one of its
 * sources loads, and shared/images.css keeps it invisible meanwhile, so the browser's
 * broken-image icon never shows. Covers the theme's fallback chains (Library Home art tries a
 * local copy, then the CDN) and Steam's own images alike.
 *
 * Listeners sit on each image, not the document: images are often built off-page (innerHTML
 * into a detached box) and fail before they are attached, and an event on a detached element
 * never reaches the document. Each image is also judged by its state when seen:
 * - loading with nothing drawn yet: hidden until it loads. This is the case that showed the
 *   icon: a fallback chain swaps in the next source inside the failure handler, and while
 *   that source loads the browser keeps drawing the failed one's broken icon;
 * - finished with no pixels: decode() tells a failure from an image without an intrinsic size
 *   (an SVG), which must stay visible.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedImages?.destroy();
  if (!document.documentElement) return;

  const BROKEN = 'data-se-img-broken';
  const watched = new WeakSet();

  const onError = event => event.currentTarget.setAttribute(BROKEN, '');
  const onLoad = event => event.currentTarget.removeAttribute(BROKEN);

  const settle = img => {
    if (!img.getAttribute('src') && !img.getAttribute('srcset')) return;
    if (img.naturalWidth) {
      if (img.complete) img.removeAttribute(BROKEN);
      return;
    }
    if (!img.complete) {
      img.setAttribute(BROKEN, '');
      return;
    }
    const source = img.currentSrc || img.src;
    img.decode().then(
      () => img.removeAttribute(BROKEN),
      () => {
        if ((img.currentSrc || img.src) === source && img.complete && !img.naturalWidth) img.setAttribute(BROKEN, '');
      }
    );
  };

  const watch = img => {
    if (!watched.has(img)) {
      watched.add(img);
      img.addEventListener('error', onError);
      img.addEventListener('load', onLoad);
    }
    settle(img);
  };

  const scan = node => {
    if (node.nodeType !== 1) return;
    if (node.tagName === 'IMG') watch(node);
    else for (const img of node.getElementsByTagName('img')) watch(img);
  };

  /*
   * A new source on a broken image keeps it hidden until that source loads (settle waits).
   * Only images: iframes, scripts, <source> and media carry src/srcset too.
   */
  const watcher = SE.watch(
    records => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (record.target.tagName === 'IMG') watch(record.target);
        } else {
          for (const node of record.addedNodes) scan(node);
        }
      }
    },
    { records: true, attributes: ['src', 'srcset'] }
  );
  scan(document.documentElement);

  window.__steamEnhancedImages = {
    destroy() {
      watcher.disconnect();
      for (const img of document.images) {
        img.removeEventListener('error', onError);
        img.removeEventListener('load', onLoad);
        img.removeAttribute(BROKEN);
      }
      delete window.__steamEnhancedImages;
    },
  };
});
