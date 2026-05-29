declare module 'dom-to-image-more' {
  interface Options {
    width?: number
    height?: number
    style?: Record<string, string>
    quality?: number
    bgcolor?: string
    imagePlaceholder?: string
    cacheBust?: boolean
    [key: string]: unknown
  }

  const domtoimage: {
    toBlob(node: Element, options?: Options): Promise<Blob>
    toPng(node: Element, options?: Options): Promise<string>
    toJpeg(node: Element, options?: Options): Promise<string>
    toSvg(node: Element, options?: Options): Promise<string>
    toPixelData(node: Element, options?: Options): Promise<Uint8ClampedArray>
  }

  export default domtoimage
}
