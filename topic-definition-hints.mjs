export const TOPIC_DEFINITION_DELAY_MS = 500;
export const TOUCH_DEFINITION_DURATION_MS = 4500;

const VISIBLE_CLASS = 'is-definition-visible';

function positionDefinition(option) {
  const rect = option?.getBoundingClientRect?.();
  if (!rect || typeof window === 'undefined' || !Number.isFinite(window.innerWidth)) return;
  const viewportPadding = 12;
  const maxTooltipWidth = Math.min(300, window.innerWidth * 0.28);
  option.classList.toggle(
    'definition-left',
    rect.right + maxTooltipWidth + viewportPadding > window.innerWidth,
  );
}

function optionFromEvent(event) {
  return event.target?.closest?.('.target-option') || null;
}

function isInside(option, node) {
  return Boolean(node && option?.contains?.(node));
}

export function attachTopicDefinitionHints(root, timers = globalThis) {
  if (!root) return () => {};

  const setTimer = timers.setTimeout.bind(timers);
  const clearTimer = timers.clearTimeout.bind(timers);
  let pendingOption = null;
  let pendingTimer = null;
  let activeOption = null;
  let touchTimer = null;

  function setDefinitionVisibility(option, visible) {
    option.classList.toggle(VISIBLE_CLASS, visible);
    option.querySelector?.('.target-definition')?.toggleAttribute('hidden', !visible);
    option.querySelector?.('.target-definition')?.setAttribute('aria-hidden', String(!visible));
    option.setAttribute?.('aria-expanded', String(visible));
    if (visible) {
      positionDefinition(option);
      activeOption = option;
    }
    else if (activeOption === option) activeOption = null;
  }

  function hide(option) {
    if (!option) return;
    setDefinitionVisibility(option, false);
  }

  function clearPending() {
    if (pendingTimer) clearTimer(pendingTimer);
    pendingTimer = null;
    pendingOption = null;
  }

  function show(option) {
    if (!option) return;
    clearPending();
    if (activeOption && activeOption !== option) hide(activeOption);
    setDefinitionVisibility(option, true);
  }

  function schedule(option) {
    if (!option) return;
    clearPending();
    pendingOption = option;
    pendingTimer = setTimer(() => {
      pendingTimer = null;
      pendingOption = null;
      show(option);
    }, TOPIC_DEFINITION_DELAY_MS);
  }

  function pointerOver(event) {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const option = optionFromEvent(event);
    if (!option || isInside(option, event.relatedTarget)) return;
    schedule(option);
  }

  function pointerOut(event) {
    const option = optionFromEvent(event);
    if (!option || isInside(option, event.relatedTarget)) return;
    if (pendingOption === option) clearPending();
    hide(option);
  }

  function focusIn(event) {
    const option = optionFromEvent(event);
    if (!option || isInside(option, event.relatedTarget)) return;
    schedule(option);
  }

  function focusOut(event) {
    const option = optionFromEvent(event);
    if (!option || isInside(option, event.relatedTarget)) return;
    if (pendingOption === option) clearPending();
    hide(option);
  }

  function pointerUp(event) {
    if (event.pointerType === 'mouse') return;
    const option = optionFromEvent(event);
    if (!option) return;

    clearPending();
    if (activeOption === option) {
      hide(option);
      if (touchTimer) clearTimer(touchTimer);
      touchTimer = null;
      return;
    }

    show(option);
    if (touchTimer) clearTimer(touchTimer);
    touchTimer = setTimer(() => {
      touchTimer = null;
      hide(option);
    }, TOUCH_DEFINITION_DURATION_MS);
  }

  root.addEventListener('pointerover', pointerOver);
  root.addEventListener('pointerout', pointerOut);
  root.addEventListener('pointerup', pointerUp);
  root.addEventListener('focusin', focusIn);
  root.addEventListener('focusout', focusOut);

  return () => {
    clearPending();
    if (touchTimer) clearTimer(touchTimer);
    hide(activeOption);
    root.removeEventListener('pointerover', pointerOver);
    root.removeEventListener('pointerout', pointerOut);
    root.removeEventListener('pointerup', pointerUp);
    root.removeEventListener('focusin', focusIn);
    root.removeEventListener('focusout', focusOut);
  };
}
