/** Observe UI focus/input metadata only. Never read chat messages or editor text. */
export function observeAgentActivity(report: (source: 'agent' | 'manual') => void): void {
  const agentName = /\b(codex|copilot|cline|roo code|continue|agent|chat|bob)\b|openai[.-]chatgpt/i;
  let lastReport = 0;
  let lastSource = '';
  function send(source: 'agent' | 'manual'): void {
    const now = Date.now();
    if (source !== lastSource || now - lastReport >= 4000) {
      lastSource = source; lastReport = now; report(source);
    }
  }
  function inAgentPanel(target: Element | null): boolean {
    if (!target || target.closest('#codeboy-floating-root')) return false;
    if (target.closest('.interactive-session, .chat-widget, .chat-input-part')) return true;
    // Extension webviews are isolated: only their host's label is available.
    if (target.tagName === 'IFRAME') {
      let host: Element | null = target;
      for (let depth = 0; host && depth < 6; depth++, host = host.parentElement) {
        if (agentName.test([host.getAttribute('title'), host.getAttribute('aria-label'), host.getAttribute('data-extension-id'), host.id].join(' '))) return true;
      }
      // VS Code mounts extension iframes in a separate overlay container, outside
      // their view's DOM ancestry. Match the focused frame to the visible pane
      // geometrically, and inspect only the pane title / selected tab label.
      const frame = target.getBoundingClientRect();
      if (frame.width < 1 || frame.height < 1) return false;
      for (const pane of document.querySelectorAll('.part.auxiliarybar, .part.sidebar, .editor-group-container')) {
        const bounds = pane.getBoundingClientRect();
        const centerX = frame.left + frame.width / 2;
        const centerY = frame.top + frame.height / 2;
        if (centerX < bounds.left || centerX > bounds.right || centerY < bounds.top || centerY > bounds.bottom) continue;
        const labels = pane.querySelectorAll('.composite.title .title-label, .pane-header .title, [role="tab"][aria-selected="true"], .tab.active');
        for (const label of labels) {
          const rect = label.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && agentName.test(label.getAttribute('aria-label') || label.textContent || '')) return true;
        }
      }
    }
    return false;
  }
  document.addEventListener('keydown', event => {
    if (!event.isTrusted || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as Element | null;
    if (inAgentPanel(target)) send('agent');
    else if (target?.closest('.monaco-editor') && !target.closest('.interactive-session, .chat-widget')) {
      if (event.key.length === 1 || ['Enter', 'Backspace', 'Delete', 'Tab'].includes(event.key)) send('manual');
    }
  }, true);
  document.addEventListener('focusin', () => {
    if (inAgentPanel(document.activeElement)) send('agent');
  });
  window.addEventListener('blur', () => {
    // Focus crosses into the isolated iframe after the parent's blur event.
    setTimeout(() => {
      if (document.hasFocus() && inAgentPanel(document.activeElement)) send('agent');
    }, 0);
  });
  // A focus signal means the user is working with the agent, not proof that it is generating.
  setInterval(() => {
    if (document.hasFocus() && inAgentPanel(document.activeElement)) send('agent');
  }, 2000);
}
