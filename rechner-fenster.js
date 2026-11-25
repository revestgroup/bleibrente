'use strict';

const calculatorDialog = document.querySelector('#rechner');

if (calculatorDialog) {
  const frame = calculatorDialog.querySelector('iframe');
  const hasDeepLink = () => window.location.hash === '#rechner';
  let completed = false;

  function openCalculator() {
    if (calculatorDialog.open) return;
    if (!frame.hasAttribute('src')) frame.src = frame.dataset.src;
    calculatorDialog.showModal();
  }

  document.querySelectorAll('[data-open-rechner]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      openCalculator();
    });
  });
  calculatorDialog.addEventListener('click', (event) => {
    if (event.target === calculatorDialog) calculatorDialog.close();
  });
  calculatorDialog.addEventListener('close', () => {
    if (hasDeepLink()) history.replaceState(history.state, '', window.location.pathname + window.location.search);
    if (completed) {
      frame.removeAttribute('src');
      calculatorDialog.style.removeProperty('--rechner-height');
      completed = false;
    }
  });
  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow || !event.data) return;
    if (event.data.type === 'close-calculator') calculatorDialog.close();
    if (event.data.type !== 'calculator-size' || !Number.isFinite(event.data.height) || event.data.height <= 0) return;
    calculatorDialog.style.setProperty('--rechner-height', Math.min(10000, Math.ceil(event.data.height)) + 'px');
    if (event.data.completed === true) completed = true;
  });
  window.addEventListener('hashchange', () => {
    if (hasDeepLink()) openCalculator();
  });
  if (hasDeepLink()) openCalculator();
}

if (window.parent !== window && new URLSearchParams(window.location.search).get('fenster') === '1') {
  document.documentElement.classList.add('embedded');
  const main = document.querySelector('main');
  const closeWindow = () => window.parent.postMessage({ type: 'close-calculator' }, '*');
  const returnLink = document.querySelector('[data-close-rechner]');

  new ResizeObserver(() => {
    window.parent.postMessage({
      type: 'calculator-size',
      height: main.getBoundingClientRect().height,
      completed: Boolean(returnLink),
    }, '*');
  }).observe(main);
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    closeWindow();
  });
  returnLink?.addEventListener('click', (event) => {
    event.preventDefault();
    closeWindow();
  });
}
