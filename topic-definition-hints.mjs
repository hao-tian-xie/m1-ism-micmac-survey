export const TOPIC_DEFINITION_DELAY_MS = 500;
export const TOUCH_DEFINITION_DURATION_MS = 4500;

const VISIBLE_CLASS = 'is-definition-visible';

function positionDefinition(option) {
  const definition = option?.querySelector?.('.target-definition');
  const rect = option?.getBoundingClientRect?.();
  if (!definition || !rect || typeof window === 'undefined'
    || !Number.isFinite(window.innerWidth) || !Number.isFinite(window.innerHeight)) return;
  const edge = 12;
  const gap = 10;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(340, Math.max(0, viewportWidth - edge * 2));
  const maxHeight = Math.max(0, viewportHeight - edge * 2);
  definition.style.width = `${width}px`;
  definition.style.maxHeight = `${maxHeight}px`;
  const measured = definition.getBoundingClientRect?.();
  const tooltipWidth = Number(measured?.width) || width;
  const tooltipHeight = Number(measured?.height) || Math.min(180, maxHeight);

  let left = rect.right + gap;
  let side = 'right';
  if (left + tooltipWidth > viewportWidth - edge) {
    left = rect.left - tooltipWidth - gap;
    side = 'left';
  }
  if (left < edge || left + tooltipWidth > viewportWidth - edge) {
    left = Math.min(Math.max(edge, rect.left), Math.max(edge, viewportWidth - tooltipWidth - edge));
    side = 'overlap';
  }

  let top = rect.top + (rect.height - tooltipHeight) / 2;
  let vertical = 'center';
  if (top < edge) {
    top = rect.bottom + gap;
    vertical = 'below';
  } else if (top + tooltipHeight > viewportHeight - edge) {
    const above = rect.top - tooltipHeight - gap;
    top = above >= edge ? above : viewportHeight - tooltipHeight - edge;
    vertical = above >= edge ? 'above' : 'clamped';
  }
  top = Math.min(Math.max(edge, top), Math.max(edge, viewportHeight - tooltipHeight - edge));
  definition.style.left = `${left}px`;
  definition.style.top = `${top}px`;
  option.classList.toggle('definition-left', side === 'left');
  option.classList.toggle('definition-below', vertical === 'below');
  option.classList.toggle('definition-above', vertical === 'above');
}

function optionFromEvent(event) {
  return event.target?.closest?.('.target-option') || null;
}

function isInside(option, node) {
  return Boolean(node && option?.contains?.(node));
}

function isFocused(option) {
  if (typeof document === 'undefined') return false;
  return isInside(option, document.activeElement);
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

  function clearTouchTimer() {
    if (touchTimer) clearTimer(touchTimer);
    touchTimer = null;
  }

  function clearPending() {
    if (pendingTimer) clearTimer(pendingTimer);
    pendingTimer = null;
    pendingOption = null;
  }

  function show(option) {
    if (!option) return;
    clearPending();
    clearTouchTimer();
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
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const option = optionFromEvent(event);
    if (!option || isInside(option, event.relatedTarget)) return;
    if (pendingOption === option) clearPending();
    if (isFocused(option)) return;
    hide(option);
  }

  function focusIn(event) {
    const option = optionFromEvent(event);
    if (!option || isInside(option, event.relatedTarget)) return;
    show(option);
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

    const togglesVisibleTouchHint = activeOption === option && Boolean(touchTimer);
    clearPending();
    if (togglesVisibleTouchHint) {
      hide(option);
      clearTouchTimer();
      return;
    }

    show(option);
    touchTimer = setTimer(() => {
      touchTimer = null;
      hide(option);
    }, TOUCH_DEFINITION_DURATION_MS);
  }

  function pointerCancel(event) {
    if (event.pointerType === 'mouse') return;
    const option = optionFromEvent(event);
    if (!option) return;
    if (pendingOption === option) clearPending();
    if (activeOption === option) clearTouchTimer();
    hide(option);
  }

  root.addEventListener('pointerover', pointerOver);
  root.addEventListener('pointerout', pointerOut);
  root.addEventListener('pointerup', pointerUp);
  root.addEventListener('pointercancel', pointerCancel);
  root.addEventListener('focusin', focusIn);
  root.addEventListener('focusout', focusOut);

  const viewport = typeof window !== 'undefined' ? window : null;
  const reposition = () => positionDefinition(activeOption);
  viewport?.addEventListener('resize', reposition);
  viewport?.addEventListener('scroll', reposition, { passive: true });

  return () => {
    clearPending();
    if (touchTimer) clearTimer(touchTimer);
    hide(activeOption);
    root.removeEventListener('pointerover', pointerOver);
    root.removeEventListener('pointerout', pointerOut);
    root.removeEventListener('pointerup', pointerUp);
    root.removeEventListener('pointercancel', pointerCancel);
    root.removeEventListener('focusin', focusIn);
    root.removeEventListener('focusout', focusOut);
    viewport?.removeEventListener('resize', reposition);
    viewport?.removeEventListener('scroll', reposition);
  };
}
