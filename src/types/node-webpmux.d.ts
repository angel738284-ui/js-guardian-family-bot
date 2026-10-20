// node-webpmux ships without TypeScript types. Only the parts we use are described here.
declare module "node-webpmux" {
  export class Image {
    exif: Buffer | null;
    load(source: Buffer | string): Promise<void>;
    save(path: null): Promise<Buffer>;
  }
}
