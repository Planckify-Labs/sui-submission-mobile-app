import type { ApprovalRenderer } from "./approval";

const renderers: ApprovalRenderer[] = [];

export function registerRenderer(r: ApprovalRenderer): void {
  renderers.push(r);
}

export function registerRendererFirst(r: ApprovalRenderer): void {
  renderers.unshift(r);
}

export function getRenderers(): ApprovalRenderer[] {
  return [...renderers];
}

export function clearRenderers(): void {
  renderers.length = 0;
}
