/**
 * Is this document running inside a parent frame that could host it?
 *
 * Penpal's handshake is symmetric, so a guest opened at the top level completes a
 * handshake against its own window and hands back a proxy of its own methods. That looks
 * exactly like a connected host, which would strand the standalone build waiting for a
 * wallet that does not exist. The frame check is the only deterministic answer.
 */
export const isEmbedded = (win: Window | undefined = typeof window === 'undefined' ? undefined : window): boolean => {
  if (!win) return false;

  try {
    return win.parent !== win;
  } catch {
    // Cross-origin access to `parent` can throw in hardened sandboxes. Throwing at all
    // means there is a parent frame to be blocked from.
    return true;
  }
};
