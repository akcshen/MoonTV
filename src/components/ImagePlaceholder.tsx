// 图片占位符组件 - 骨架屏样式定义在 globals.css
const ImagePlaceholder = ({ aspectRatio }: { aspectRatio: string }) => (
  <div className={`image-placeholder w-full ${aspectRatio} rounded-lg`} />
);

export { ImagePlaceholder };
