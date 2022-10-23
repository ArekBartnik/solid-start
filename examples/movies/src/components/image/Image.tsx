import {
  Component,
  createMemo,
  createSignal,
  JSX,
  on,
  Show,
  splitProps,
  useContext
} from "solid-js";
import { Link } from "solid-start";
import { defaultLoader } from "./loaders";
import { ImageConfig, ImageLoaderWithConfig, ImageProps, ImgElementWithDataProp } from "./types";
import {
  checkImage,
  generateImgAttrs,
  getImageBlurSvg,
  getInt,
  handleLoading,
  ImageConfigContext,
  imageConfigDefault,
  isStaticImport,
  isStaticRequire
} from "./utils";

/**
 * Migrated from next/future/image. Credit and copywrite for the original source
 * should be attributed to Next.js and Vercel.
 */

const allImgs = new Map<string, { src: string; priority: boolean; placeholder: string }>();
let perfObserver: PerformanceObserver | undefined;

const Image: Component<ImageProps> = inProps => {
  const [props, sizes, rest]: Partial<ImageProps>[] = splitProps(
    inProps,
    [
      "src",
      "sizes",
      "unoptimized",
      "priority",
      "loading",
      "class",
      "quality",
      "width",
      "height",
      "fill",
      "style",
      "onLoadingComplete",
      "placeholder",
      "blurDataURL"
    ],
    ["deviceSizes", "imageSizes"]
  );
  const configContext = useContext(ImageConfigContext);
  // Is this memo really needed? Seems a bit unnecessary for an image component.
  const config = createMemo<ImageConfig>(
    on(
      () => [configContext, sizes],
      () => {
        const c = configContext || imageConfigDefault;

        // Let the user override sizes at the component level
        let deviceSizes = sizes.deviceSizes || c.deviceSizes;
        const imageSizes = sizes.imageSizes || c.imageSizes;

        const allSizes = [...deviceSizes, ...imageSizes].sort((a, b) => a - b);
        deviceSizes = deviceSizes.sort((a, b) => a - b);
        return { ...c, allSizes, deviceSizes };
      }
    )
  );

  // Use a loader supplied to the context with a fallback to the defaultLoader
  let loader: ImageLoaderWithConfig = defaultLoader;

  if ("loader" in rest) {
    if (rest.loader) {
      const customImageLoader = rest.loader;
      loader = obj => {
        const { config: _, ...opts } = obj;
        // The config object is internal only so we must
        // not pass it to the user-defined loader()
        return customImageLoader(opts);
      };
    }
    // Remove property so it's not spread on <img>
    delete rest.loader;
  } else if (config().imageLoader && config().loader === "custom") {
    loader = obj => {
      const { config: _, ...opts } = obj;
      // The config object is internal only so we must
      // not pass it to the user-defined loader()
      return config().imageLoader(opts);
    };
  }

  let staticSrc = "";
  let widthInt = getInt(props.width);
  let heightInt = getInt(props.height);
  let blurWidth: number | undefined;
  let blurHeight: number | undefined;
  let blurDataURL = props.blurDataURL;

  if (isStaticImport(props.src)) {
    const staticImageData = isStaticRequire(props.src) ? props.src.default : props.src;
    if (!staticImageData.src) {
      throw new Error(
        `An object should only be passed to the image component src parameter if it comes from a static image import. It must include src. Received ${JSON.stringify(
          staticImageData
        )}`
      );
    }
    if (!staticImageData.height || !staticImageData.width) {
      throw new Error(
        `An object should only be passed to the image component src parameter if it comes from a static image import. It must include height and width. Received ${JSON.stringify(
          staticImageData
        )}`
      );
    }
    blurWidth = staticImageData.blurWidth;
    blurHeight = staticImageData.blurHeight;
    blurDataURL = props.blurDataURL || staticImageData.blurDataURL;
    staticSrc = staticImageData.src;
    if (!props.fill) {
      if (!widthInt && !heightInt) {
        widthInt = staticImageData.width;
        heightInt = staticImageData.height;
      } else if (widthInt && !heightInt) {
        const ratio = widthInt / staticImageData.width;
        heightInt = Math.round(staticImageData.height * ratio);
      } else if (!widthInt && heightInt) {
        const ratio = heightInt / staticImageData.height;
        widthInt = Math.round(staticImageData.width * ratio);
      }
    }
  }
  const src = typeof props.src === "string" ? props.src : staticSrc;
  let unoptimized = props.unoptimized || false;
  let isLazy =
    !props.priority && (props.loading === "lazy" || typeof props.loading === "undefined");
  if (src.startsWith("data:") || src.startsWith("blob:")) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
    unoptimized = true;
    isLazy = false;
  }
  if (config().unoptimized) {
    unoptimized = true;
  }
  const [blurComplete, setBlurComplete] = createSignal(false);
  const [showAltText, setShowAltText] = createSignal(false);
  const qualityInt = getInt(props.quality);
  if (import.meta.env.MODE !== "production") {
    checkImage({
      src,
      unoptimized,
      props,
      widthInt,
      heightInt,
      rest,
      blurDataURL,
      qualityInt,
      allImgs,
      perfObserver,
      loader,
      defaultLoader,
      config
    });
  }
  const imgStyle = createMemo<JSX.CSSProperties>(() =>
    Object.assign(
      props.fill
        ? {
            position: "absolute",
            height: "100%",
            width: "100%",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0
          }
        : {},
      showAltText() ? {} : { color: "transparent" },
      props.style instanceof Object ? props.style : {}
    )
  );
  const blurStyle = createMemo(() =>
    props.placeholder === "blur" && blurDataURL && !blurComplete()
      ? {
          "background-size": imgStyle()["object-fit"] || "cover",
          "background-position": imgStyle()["object-position"] || "50% 50%",
          "background-repeat": "no-repeat",
          "background-image": `url("data:image/svg+xml;charset=utf-8,${getImageBlurSvg({
            widthInt,
            heightInt,
            blurWidth,
            blurHeight,
            blurDataURL
          })}")`
        }
      : {}
  );
  const imgAttributes = createMemo(() =>
    generateImgAttrs({
      config: config(),
      src,
      unoptimized,
      width: widthInt,
      quality: qualityInt,
      sizes: props.sizes,
      loader
    })
  );
  let srcString: string = src;
  if (import.meta.env.MODE !== "production") {
    if (typeof window !== "undefined") {
      let fullUrl: URL;
      try {
        fullUrl = new URL(imgAttributes().src);
      } catch (e) {
        fullUrl = new URL(imgAttributes().src, window.location.href);
      }
      allImgs.set(fullUrl.href, {
        src,
        priority: props.priority,
        placeholder: props.placeholder || "empty"
      });
    }
  }
  return (
    <>
      <img
        {...rest}
        {...imgAttributes()}
        width={widthInt}
        height={heightInt}
        decoding="async"
        data-nimg={`future${props.fill ? "-fill" : ""}`}
        class={props.class}
        loading={isLazy ? "lazy" : props.loading}
        style={{
          ...imgStyle(),
          ...blurStyle()
        }}
        ref={(imgEl: ImgElementWithDataProp | null) => {
          if (!imgEl) return;
          if (props.onError) {
            // If the image has an error before hydrating, then the error is lost.
            // The workaround is to wait until the image is mounted which is after hydration,
            // then we set the src again to trigger the error handler (if there was an error).
            // eslint-disable-next-line no-self-assign
            imgEl.src = imgEl.src;
          }
          if (import.meta.env.MODE !== "production") {
            if (!srcString) {
              console.error(`Image is missing required "src" property:`, imgEl);
            }
            if (imgEl.getAttribute("objectFit") || imgEl.getAttribute("objectfit")) {
              console.error(
                `Image has unknown prop "objectFit". Did you mean to use the "style" prop instead?`,
                imgEl
              );
            }
            if (imgEl.getAttribute("objectPosition") || imgEl.getAttribute("objectposition")) {
              console.error(
                `Image has unknown prop "objectPosition". Did you mean to use the "style" prop instead?`,
                imgEl
              );
            }
            if (imgEl.getAttribute("alt") === null) {
              console.error(
                `Image is missing required "alt" property. Please add Alternative Text to describe the image for screen readers and search engines.`
              );
            }
          }
          if (imgEl.complete) {
            handleLoading(
              imgEl,
              srcString,
              props.placeholder,
              props.onLoadingComplete,
              setBlurComplete
            );
          }
        }}
        onLoad={event => {
          const img = event.currentTarget as ImgElementWithDataProp;
          handleLoading(
            img,
            srcString,
            props.placeholder,
            props.onLoadingComplete,
            setBlurComplete
          );
          if (props.onLoad) props.onLoad(event);
        }}
        onError={event => {
          // If the real image fails to load, this will ensure "alt" is visible
          setShowAltText(true);
          if (props.placeholder === "blur") {
            // If the real image fails to load, this will still remove the placeholder.
            setBlurComplete(true);
          }
          if (props.onError) {
            props.onError(event);
          }
        }}
      />
      <Show when={props.priority}>
        {/*
          Note how we omit the `href` attribute, as it would only be` relevant
          for browsers that do not support `imagesrcset`, and in those cases
          it would likely cause the incorrect image to be preloaded.
          https://html.spec.whatwg.org/multipage/semantics.html#attr`-link-imagesrcset
        */}
        <Link
          rel="preload"
          as="image"
          href={imgAttributes().srcSet ? "" : imgAttributes().src}
          imagesizes={imgAttributes().sizes || ""}
          imagesrcset={imgAttributes().srcSet || ""}
        />
      </Show>
    </>
  );
};

export default Image;
