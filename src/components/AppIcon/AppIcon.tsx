import { useEffect, useState } from "react";
import { displayIcon, peekTrimmedIcon } from "../../utils/icon";

export function AppIconImg({ src }: { src: string }) {
  const [url, setUrl] = useState(() => peekTrimmedIcon(src) ?? src);

  useEffect(() => {
    const peeked = peekTrimmedIcon(src);
    if (peeked) {
      setUrl(peeked);
      return;
    }
    let live = true;
    void displayIcon(src).then((next) => {
      if (live) setUrl(next);
    });
    return () => {
      live = false;
    };
  }, [src]);

  return <img src={url} alt="" draggable={false} />;
}
