import { buildAnnounceScript, type Eip6963Info } from "./eip6963";

export interface EvmInjectedScriptParams {
  selectedAddress: string | null;
  chainId: string; // 0x-prefixed hex
  networkVersion: string; // decimal chain id
  info: Eip6963Info;
}

/**
 * Builds the EIP-1193 `window.ethereum` provider script + EIP-6963 announce.
 * Every `request({method, params})` is forwarded to React Native via
 * `ReactNativeWebView.postMessage({type: 'bridge_request', …})` and awaits
 * a matching response posted back either via a window `message` event or
 * an injected `window._handleEthereumResponse(...)` call (dual-path so
 * dApps that race both transports keep working).
 *
 * Provider exposes legacy `send` / `sendAsync` / `enable` in addition to
 * EIP-1193 `request` — wagmi/web3modal/ConnectKit probe these before
 * giving up on an injected wallet, and missing them is a silent
 * connect-failure cause.
 */
export function getEvmInjectedScript(p: EvmInjectedScriptParams): string {
  const initial = JSON.stringify({
    selectedAddress: p.selectedAddress,
    chainId: p.chainId,
    networkVersion: p.networkVersion,
  });
  return `
(function() {
  // Unconditional heartbeat — fires on every injection pass regardless
  // of install state. If you don't see "hb" in Metro logs after opening
  // a dApp, the RN → WebView injection channel is not firing at all.
  try {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'takumi_diagnostic',
      tag: 'hb',
      at: Date.now(),
      location: location.href,
      readyState: document.readyState,
      alreadyInstalled: !!window.__takumi_evm_installed
    }));
  } catch (e) {}

  if (window.__takumi_evm_installed) {
    try {
      window._updateEthereumProvider && window._updateEthereumProvider(${initial});
    } catch (e) {}
    return;
  }
  window.__takumi_evm_installed = true;

  var initial = ${initial};

  var provider = {
    isMetaMask: true,
    isTakumi: true,
    selectedAddress: initial.selectedAddress,
    chainId: initial.chainId,
    networkVersion: initial.networkVersion,
    _eventListeners: new Map(),
    _isConnectedState: !!initial.selectedAddress,
    _metamask: {
      isUnlocked: function() {
        return Promise.resolve(!!provider.selectedAddress);
      }
    },
    isConnected: function() {
      return this._isConnectedState && !!this.selectedAddress;
    },
    on: function(event, cb) {
      if (typeof event !== 'string' || typeof cb !== 'function') return;
      if (!this._eventListeners.has(event)) this._eventListeners.set(event, new Set());
      this._eventListeners.get(event).add(cb);
    },
    addListener: function(event, cb) { return this.on(event, cb); },
    off: function(event, cb) { return this.removeListener(event, cb); },
    removeListener: function(event, cb) {
      if (typeof event !== 'string' || typeof cb !== 'function') return;
      var set = this._eventListeners.get(event);
      if (set) set.delete(cb);
    },
    removeAllListeners: function(event) {
      if (event) { this._eventListeners.delete(event); }
      else { this._eventListeners.clear(); }
    },
    _emit: function(event) {
      var args = Array.prototype.slice.call(arguments, 1);
      var set = this._eventListeners.get(event);
      if (!set) return;
      set.forEach(function(cb) {
        try { cb.apply(null, args); } catch (e) { console.error(e); }
      });
    },
    request: function(args) {
      if (!args || typeof args !== 'object') {
        return Promise.reject(new Error('Invalid request arguments'));
      }
      if (typeof args.method !== 'string') {
        return Promise.reject(new Error('Invalid method parameter'));
      }
      return new Promise(function(resolve, reject) {
        var id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        window._pendingRequests = window._pendingRequests || new Map();
        window._pendingRequests.set(id, { resolve: resolve, reject: reject });
        try {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'bridge_request',
            namespace: 'eip155',
            id: id,
            method: args.method,
            params: args.params || []
          }));
        } catch (e) {
          window._pendingRequests.delete(id);
          reject(new Error('Failed to send request to wallet'));
        }
      });
    },
    // --- Legacy methods ------------------------------------------------
    // Older dApp stacks still try sendAsync/send/enable before giving up.
    // We funnel them through the same transport as \`request\`.
    sendAsync: function(payload, callback) {
      var handleOne = function(single) {
        return provider.request({ method: single.method, params: single.params || [] })
          .then(function(result) {
            callback && callback(null, { id: single.id, jsonrpc: '2.0', result: result });
          })
          .catch(function(err) {
            callback && callback(err, { id: single && single.id, jsonrpc: '2.0', error: { code: err && err.code, message: err && err.message } });
          });
      };
      if (Array.isArray(payload)) {
        return Promise.all(payload.map(handleOne));
      }
      return handleOne(payload);
    },
    send: function(methodOrPayload, paramsOrCallback) {
      // EIP-1193 deprecated three shapes:
      //   send(method: string, params: any[]): Promise<any>     (web3.js)
      //   send(payload, callback): void                          (legacy)
      //   send(payload): unknown                                 (sync-like)
      if (typeof methodOrPayload === 'string') {
        return provider.request({ method: methodOrPayload, params: paramsOrCallback || [] });
      }
      if (typeof paramsOrCallback === 'function') {
        return provider.sendAsync(methodOrPayload, paramsOrCallback);
      }
      // Sync-ish fallback — return a synthesized response for reads only.
      return provider.request({ method: methodOrPayload.method, params: methodOrPayload.params || [] });
    },
    enable: function() {
      // Pre-EIP-1193; wraps eth_requestAccounts.
      return provider.request({ method: 'eth_requestAccounts', params: [] });
    }
  };

  window._handleEthereumResponse = function(response) {
    var req = window._pendingRequests && window._pendingRequests.get(response.id);
    if (!req) return;
    window._pendingRequests.delete(response.id);
    if (response.error) {
      var err = new Error(response.error.message || 'Unknown error');
      err.code = response.error.code || -32603;
      if (response.error.data !== undefined) err.data = response.error.data;
      req.reject(err);
    } else {
      req.resolve(response.result);
    }
  };

  window._updateEthereumProvider = function(update) {
    var prevAddress = provider.selectedAddress;
    var prevChain = provider.chainId;
    var wasConnected = provider._isConnectedState;
    if ('selectedAddress' in update) provider.selectedAddress = update.selectedAddress || null;
    if ('chainId' in update) provider.chainId = update.chainId;
    if ('networkVersion' in update) provider.networkVersion = update.networkVersion;
    provider._isConnectedState = !!provider.selectedAddress;
    if (prevAddress !== provider.selectedAddress) {
      provider._emit('accountsChanged', provider.selectedAddress ? [provider.selectedAddress] : []);
    }
    if (prevChain !== provider.chainId) {
      provider._emit('chainChanged', provider.chainId);
    }
    if (provider.selectedAddress && !wasConnected) {
      provider._emit('connect', { chainId: provider.chainId });
    } else if (!provider.selectedAddress && wasConnected) {
      provider._emit('disconnect', { code: 4900, message: 'Disconnected' });
    }
  };

  window.addEventListener('message', function(event) {
    try {
      var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'bridge_response') {
        window._handleEthereumResponse(data);
      } else if (data.type === 'bridge_update' && data.namespace === 'eip155') {
        window._updateEthereumProvider(data);
      }
    } catch (e) {}
  });

  // Stash a private reference so the EIP-6963 announce script can always
  // find OUR provider, even if a dApp (or a competing wallet extension
  // polyfilled into the page) later overwrites window.ethereum.
  window.__takumi_evm_provider = provider;

  window.ethereum = provider;
  if (typeof window.web3 === 'undefined') {
    window.web3 = { currentProvider: provider };
  } else {
    window.web3.currentProvider = provider;
  }

  window.dispatchEvent(new Event('ethereum#initialized'));
})();
${buildAnnounceScript(p.info)}
${buildDiagnosticScript()}
`;
}

/**
 * Runs in the WebView. Snapshots the provider/6963 install state, plus
 * any EIP-6963 providers the page itself has announced, and posts the
 * result back as a \`takumi_diagnostic\` message so \`handleMessage\`
 * surfaces it in Metro. Fires at inject time AND at \`load\`, so we see
 * both the "before content" and "after all dApp bundles have run"
 * snapshots.
 *
 * Also patches \`console.log/warn/error\` inside the WebView to mirror
 * them back to RN via \`takumi_console\` messages — cheap way to get
 * page-side logs into Metro.
 */
function buildDiagnosticScript(): string {
  return `
(function() {
  if (window.__takumi_diag_installed) return;
  window.__takumi_diag_installed = true;

  var send = function(payload) {
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (e) {}
  };

  // --- console mirror -----------------------------------------------
  ['log', 'warn', 'error'].forEach(function(level) {
    var original = console[level];
    console[level] = function() {
      try {
        var args = [];
        for (var i = 0; i < arguments.length; i++) {
          var a = arguments[i];
          if (a instanceof Error) args.push({ __error: true, message: a.message, stack: a.stack });
          else if (typeof a === 'object') {
            try { args.push(JSON.parse(JSON.stringify(a))); }
            catch (e) { args.push(String(a)); }
          } else {
            args.push(a);
          }
        }
        send({ type: 'takumi_console', level: level, args: args });
      } catch (e) {}
      try { original.apply(console, arguments); } catch (e) {}
    };
  });

  // --- diagnostic snapshot -------------------------------------------
  var snapshot = function(tag) {
    try {
      // Dispatch our own requestProvider so we can see what this page
      // reports back and confirm the channel is live.
      var announced = [];
      var listener = function(e) {
        try {
          announced.push({
            name: e.detail && e.detail.info && e.detail.info.name,
            uuid: e.detail && e.detail.info && e.detail.info.uuid,
            rdns: e.detail && e.detail.info && e.detail.info.rdns,
            hasIcon: !!(e.detail && e.detail.info && e.detail.info.icon),
          });
        } catch (_) {}
      };
      window.addEventListener('eip6963:announceProvider', listener);
      try { window.dispatchEvent(new CustomEvent('eip6963:requestProvider')); }
      catch (_) {}
      setTimeout(function() {
        window.removeEventListener('eip6963:announceProvider', listener);
        send({
          type: 'takumi_diagnostic',
          tag: tag,
          at: Date.now(),
          location: location.href,
          readyState: document.readyState,
          hasTakumi: !!window.__takumi_evm_provider,
          eip6963Installed: !!window.__takumi_eip6963_installed,
          isTakumi: window.ethereum && window.ethereum.isTakumi,
          isMetaMask: window.ethereum && window.ethereum.isMetaMask,
          hasWindowEthereum: !!window.ethereum,
          announcedProviders: announced,
          ua: navigator.userAgent,
        });
      }, 100);
    } catch (e) {}
  };

  snapshot('inject');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { snapshot('dom_loaded'); }, { once: true });
  }
  window.addEventListener('load', function() { snapshot('load'); }, { once: true });
  setTimeout(function() { snapshot('t_plus_3s'); }, 3000);
  setTimeout(function() { snapshot('t_plus_10s'); }, 10000);
})();
`;
}
