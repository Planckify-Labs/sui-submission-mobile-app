# 😕 Takumi Wallet Technical Debt
## add chainIdFromDb to activeChain in useWallet hooks
### what's the catch?
check this AI generated shit codes broh
```typescript
  const { data: blockchains } = useBlockchains();
  const activeBlockchain = useMemo(() => {
    if (!blockchains || !activeChain) return null;
    return blockchains.find((b) => b.chainId === activeChain.chain.id); // we do this operation just to fet the blockchain id from the database!
  }, [blockchains, activeChain]);

  const { data: tokens } = useTokens({
    blockchainId: activeBlockchain?.id, // this could be more efficient if we can get chainIdFromDb from the activeChain so no need to fetch a list of blockchains when we want to fetch tokens based on active blockchain id
    isStablecoin: true,
    isActive: true,
  });
```
but dont worry on the useWallet hooks it's even more worst code 🤣