import { takumipayLogoBase64 } from "@/constants/takumipay";
import { TWallet } from "@/constants/types/walletTypes";
import { type Hash, type Hex } from "viem";
import { getAccountForWallet } from "./walletService";

export interface RequestArguments {
  readonly method: string;
  readonly params?: readonly unknown[] | object;
}

export interface ProviderRpcError extends Error {
  code: number;
  data?: unknown;
}

export interface ProviderConnectInfo {
  readonly chainId: string;
}

export interface ProviderMessage {
  readonly type: string;
  readonly data: unknown;
}

export interface EthereumProvider {
  isMetaMask: boolean;
  selectedAddress: string | null;
  chainId: string;
  networkVersion: string;

  isConnected(): boolean;
  request(args: RequestArguments): Promise<unknown>;
  on(event: string, callback: (...args: any[]) => void): void;
  removeListener(event: string, callback: (...args: any[]) => void): void;

  _metamask: {
    isUnlocked(): Promise<boolean>;
  };
}

export interface EthereumProviderEvents {
  accountsChanged: (accounts: string[]) => void;
  chainChanged: (chainId: string) => void;
  connect: (connectInfo: { chainId: string }) => void;
  disconnect: (error: { code: number; message: string }) => void;
}

class TakumiEthereumProvider implements EthereumProvider {
  public isMetaMask = true;
  public selectedAddress: string | null = null;
  public chainId: string = "0x1";
  public networkVersion: string = "1";

  public _metamask = {
    isUnlocked: async (): Promise<boolean> => {
      return !!this.wallet;
    },
  };

  private wallet: TWallet | null = null;
  private eventListeners: Map<string, Set<Function>> = new Map();
  private isConnectedState = false;

  constructor() {
    this.initializeEventListeners();
  }

  private initializeEventListeners() {
    const events = [
      "accountsChanged",
      "chainChanged",
      "connect",
      "disconnect",
      "message",
    ];
    events.forEach((event) => {
      this.eventListeners.set(event, new Set());
    });
  }

  public setWallet(wallet: TWallet | null) {
    const previousAddress = this.selectedAddress;
    this.wallet = wallet;
    this.selectedAddress = wallet?.address || null;
    this.isConnectedState = !!wallet;

    if (previousAddress !== this.selectedAddress) {
      this.emit(
        "accountsChanged",
        this.selectedAddress ? [this.selectedAddress] : [],
      );
    }

    if (wallet && !previousAddress) {
      this.emit("connect", { chainId: this.chainId });
    } else if (!wallet && previousAddress) {
      this.emit("disconnect", {
        code: 4900,
        message: "The provider is disconnected from all chains.",
      });
    }
  }

  public setChainId(chainId: string) {
    const previousChainId = this.chainId;
    this.chainId = chainId;
    this.networkVersion = parseInt(chainId, 16).toString();

    if (previousChainId !== chainId) {
      this.emit("chainChanged", chainId);
    }
  }

  public isConnected(): boolean {
    return this.isConnectedState && !!this.selectedAddress;
  }

  public on(event: string, callback: (...args: any[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  public removeListener(
    event: string,
    callback: (...args: any[]) => void,
  ): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  public async request(args: RequestArguments): Promise<unknown> {
    const { method, params = [] } = args;

    if (typeof method !== "string") {
      throw this.createProviderError(4200, "Invalid method parameter");
    }

    const paramsArray = Array.isArray(params) ? params : [];

    switch (method) {
      case "eth_requestAccounts":
        return this.handleRequestAccounts();

      case "eth_accounts":
        return this.selectedAddress ? [this.selectedAddress] : [];

      case "eth_chainId":
        return this.chainId;

      case "net_version":
        return this.networkVersion;

      case "eth_getBalance":
        return this.handleGetBalance(
          paramsArray[0] as string,
          paramsArray[1] as string,
        );

      case "eth_sendTransaction":
        return this.handleSendTransaction(paramsArray[0]);

      case "personal_sign":
        return this.handlePersonalSign(
          paramsArray[0] as string,
          paramsArray[1] as string,
        );

      case "eth_sign":
        return this.handleEthSign(
          paramsArray[1] as string,
          paramsArray[0] as string,
        );

      case "eth_signTypedData":
      case "eth_signTypedData_v1":
      case "eth_signTypedData_v3":
      case "eth_signTypedData_v4":
        return this.handleSignTypedData(
          paramsArray[1] as string,
          paramsArray[0],
          method,
        );

      case "wallet_switchEthereumChain":
        return this.handleSwitchChain(paramsArray[0] as { chainId: string });

      case "wallet_addEthereumChain":
        return this.handleAddChain(paramsArray[0]);

      case "wallet_requestPermissions":
        return this.handleRequestPermissions(paramsArray[0]);

      case "eth_getBlockByNumber":
      case "eth_getTransactionByHash":
      case "eth_getTransactionReceipt":
      case "eth_call":
      case "eth_estimateGas":
      case "eth_gasPrice":
      case "eth_getCode":
      case "eth_getStorageAt":
      case "eth_getTransactionCount":
        return this.forwardToRPC(method, paramsArray);

      default:
        throw this.createProviderError(4200, `Unsupported method: ${method}`);
    }
  }

  private async handleRequestAccounts(): Promise<string[]> {
    if (!this.wallet) {
      throw this.createProviderError(4001, "User rejected the request");
    }
    return [this.selectedAddress!];
  }

  private async handleGetBalance(
    address: string,
    blockTag: string = "latest",
  ): Promise<string> {
    return this.forwardToRPC("eth_getBalance", [address, blockTag]);
  }

  private async handleSendTransaction(transactionParams: any): Promise<Hash> {
    if (!this.isConnected()) {
      throw this.createProviderError(4900, "Provider is disconnected");
    }

    if (!this.wallet) {
      throw this.createProviderError(4100, "Unauthorized");
    }

    const account = getAccountForWallet(this.wallet);
    if (!account) {
      throw this.createProviderError(
        -32603,
        "Unable to get account for wallet",
      );
    }

    throw this.createProviderError(4001, "User rejected the request");
  }

  private async handlePersonalSign(
    message: string,
    address: string,
  ): Promise<Hex> {
    if (!this.isConnected()) {
      throw this.createProviderError(4900, "Provider is disconnected");
    }

    if (
      !this.wallet ||
      this.selectedAddress?.toLowerCase() !== address.toLowerCase()
    ) {
      throw this.createProviderError(4100, "Unauthorized");
    }

    const account = getAccountForWallet(this.wallet);
    if (!account) {
      throw this.createProviderError(
        -32603,
        "Unable to get account for wallet",
      );
    }

    throw this.createProviderError(4001, "User rejected the request");
  }

  private async handleEthSign(address: string, message: string): Promise<Hex> {
    return this.handlePersonalSign(message, address);
  }

  private async handleSignTypedData(
    address: string,
    typedData: any,
    method: string,
  ): Promise<Hex> {
    if (!this.isConnected()) {
      throw this.createProviderError(4900, "Provider is disconnected");
    }

    if (
      !this.wallet ||
      this.selectedAddress?.toLowerCase() !== address.toLowerCase()
    ) {
      throw this.createProviderError(4100, "Unauthorized");
    }

    const account = getAccountForWallet(this.wallet);
    if (!account) {
      throw this.createProviderError(
        -32603,
        "Unable to get account for wallet",
      );
    }

    throw this.createProviderError(4001, "User rejected the request");
  }

  private async handleSwitchChain(chainParams: {
    chainId: string;
  }): Promise<null> {
    const { chainId } = chainParams;

    if (!chainId || !chainId.startsWith("0x")) {
      throw this.createProviderError(-32602, "Invalid chain ID format");
    }

    const supportedChains = ["0x1", "0x89", "0xa4b1", "0xa", "0x2105"];
    if (!supportedChains.includes(chainId)) {
      throw this.createProviderError(4902, "Unrecognized chain ID");
    }

    this.setChainId(chainId);
    return null;
  }

  private async handleAddChain(chainParams: any): Promise<null> {
    if (
      !chainParams.chainId ||
      !chainParams.chainName ||
      !chainParams.rpcUrls
    ) {
      throw this.createProviderError(-32602, "Invalid parameters");
    }

    throw this.createProviderError(4001, "User rejected the request");
  }

  private async handleRequestPermissions(permissions: any): Promise<any[]> {
    if (!this.wallet) {
      throw this.createProviderError(4100, "Unauthorized");
    }

    return [
      {
        parentCapability: "eth_accounts",
        id: Math.random().toString(36).substring(2),
        date: Date.now(),
        caveats: [
          {
            type: "restrictReturnedAccounts",
            value: [this.selectedAddress],
          },
        ],
      },
    ];
  }

  private async forwardToRPC(
    method: string,
    params: readonly unknown[],
  ): Promise<any> {
    const rpcUrl = this.getRPCUrl();

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw this.createProviderError(
        data.error.code || -32603,
        data.error.message,
      );
    }

    return data.result;
  }

  private getRPCUrl(): string {
    const chainId = parseInt(this.chainId, 16);

    switch (chainId) {
      case 1:
        return "https://eth.llamarpc.com";
      case 137:
        return "https://polygon.llamarpc.com";
      case 42161:
        return "https://arbitrum.llamarpc.com";
      case 10:
        return "https://optimism.llamarpc.com";
      case 8453:
        return "https://base.llamarpc.com";
      default:
        return "https://eth.llamarpc.com";
    }
  }

  private createProviderError(
    code: number,
    message: string,
    data?: unknown,
  ): ProviderRpcError {
    const error = new Error(message) as ProviderRpcError;
    error.code = code;
    if (data !== undefined) {
      error.data = data;
    }
    return error;
  }

  public emitMessage(message: ProviderMessage): void {
    this.emit("message", message);
  }
}

export const ethereumProvider = new TakumiEthereumProvider();

export const getEthereumProviderScript = () => `
(function() {
  // EIP-1193 compliant Ethereum provider implementation
  const provider = {
    // EIP-1193 required properties
    isMetaMask: true,
    selectedAddress: null,
    chainId: '0x1',
    networkVersion: '1',
    
    // MetaMask specific extensions
    _metamask: {
      isUnlocked: async () => {
        try {
          const result = await provider.request({ method: 'eth_accounts' });
          return Array.isArray(result) && result.length > 0;
        } catch {
          return false;
        }
      }
    },
    
    // Internal event management
    _eventListeners: new Map(),
    _isConnectedState: false,
    
    // EIP-1193 required methods
    isConnected() {
      return this._isConnectedState && !!this.selectedAddress;
    },
    
    on(event, callback) {
      if (typeof event !== 'string' || typeof callback !== 'function') {
        throw new Error('Invalid event listener parameters');
      }
      
      if (!this._eventListeners.has(event)) {
        this._eventListeners.set(event, new Set());
      }
      this._eventListeners.get(event).add(callback);
    },
    
    removeListener(event, callback) {
      if (typeof event !== 'string' || typeof callback !== 'function') {
        return;
      }
      this._eventListeners.get(event)?.delete(callback);
    },
    
    // Internal event emission
    _emit(event, ...args) {
      const listeners = this._eventListeners.get(event);
      if (listeners) {
        listeners.forEach(callback => {
          try {
            callback(...args);
          } catch (error) {
            console.error('Error in', event, 'listener:', error);
          }
        });
      }
    },
    
    // EIP-1193 request method
    async request(args) {
      // Validate request arguments
      if (!args || typeof args !== 'object') {
        throw new Error('Invalid request arguments');
      }
      
      if (typeof args.method !== 'string') {
        throw new Error('Invalid method parameter');
      }
      
      return new Promise((resolve, reject) => {
        const requestId = Date.now() + Math.random();
        
        // Store the promise resolvers
        window._pendingRequests = window._pendingRequests || new Map();
        window._pendingRequests.set(requestId, { resolve, reject });
        
        // Send message to React Native
        try {
          console.log('Sending ethereum request:', args.method, 'with params:', args.params);
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'ethereum_request',
            id: requestId,
            method: args.method,
            params: args.params || []
          }));
          console.log('Message sent successfully');
        } catch (error) {
          console.error('Failed to send message to React Native:', error);
          window._pendingRequests.delete(requestId);
          reject(new Error('Failed to send request to wallet'));
        }
      });
    }
  };
  
  // Handle responses from React Native
  window._handleEthereumResponse = function(response) {
    const { id, result, error } = response;
    const request = window._pendingRequests?.get(id);
    
    if (request) {
      window._pendingRequests.delete(id);
      
      if (error) {
        // Create EIP-1193 compliant error
        const providerError = new Error(error.message || 'Unknown error');
        providerError.code = error.code || -32603;
        if (error.data !== undefined) {
          providerError.data = error.data;
        }
        request.reject(providerError);
      } else {
        request.resolve(result);
      }
    }
  };
  
  // Handle provider updates from React Native
  window._updateEthereumProvider = function(update) {
    const { selectedAddress, chainId, networkVersion } = update;
    
    const previousAddress = provider.selectedAddress;
    const previousChainId = provider.chainId;
    const wasConnected = provider._isConnectedState;
    
    provider.selectedAddress = selectedAddress;
    provider.chainId = chainId;
    provider.networkVersion = networkVersion;
    provider._isConnectedState = !!selectedAddress;
    
    // Emit EIP-1193 compliant events for changes
    if (previousAddress !== selectedAddress) {
      provider._emit('accountsChanged', selectedAddress ? [selectedAddress] : []);
    }
    
    if (previousChainId !== chainId) {
      provider._emit('chainChanged', chainId);
    }
    
    // Handle connection state changes
    if (selectedAddress && !wasConnected) {
      provider._emit('connect', { chainId });
    } else if (!selectedAddress && wasConnected) {
      provider._emit('disconnect', { 
        code: 4900, 
        message: 'The provider is disconnected from all chains.' 
      });
    }
  };
  
  // Make provider available globally
  window.ethereum = provider;
  
  // Also expose as web3.currentProvider for legacy support
  if (typeof window.web3 === 'undefined') {
    window.web3 = { currentProvider: provider };
  } else {
    window.web3.currentProvider = provider;
  }
  
  // EIP-6963: Announce provider for wallet detection
  const announceProvider = () => {
    const info = {
      uuid: 'takumi-wallet-' + Math.random().toString(36).substring(2),
      name: 'Takumi AI Wallet',
      icon: '${takumipayLogoBase64}',
      rdns: 'com.planckify.takumiwallet'
    };
    
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({ info: Object.freeze(info), provider: Object.freeze(provider) })
    }));
  };
  
  // Listen for provider requests
  window.addEventListener('eip6963:requestProvider', announceProvider);
  
  // Announce immediately
  announceProvider();
  
  // Dispatch ethereum#initialized event for legacy compatibility
  window.dispatchEvent(new Event('ethereum#initialized'));
})();
`;
