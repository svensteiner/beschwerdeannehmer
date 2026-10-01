declare module "#nitro/virtual/public-assets" {
  export function getAsset(id: string): { size: number } | null;
  export function readAsset(id: string): Promise<Buffer>;
}
