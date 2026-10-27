import type { JSX } from "preact";
import { navigate } from "../router";

type Props = JSX.HTMLAttributes<HTMLAnchorElement> & { href: string };

/** An anchor that pushes history for a plain left click and leaves every other click alone. */
export function Link({ href, onClick, ...rest }: Props) {
  const handle = (event: JSX.TargetedMouseEvent<HTMLAnchorElement>) => {
    if (typeof onClick === "function") onClick(event);
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}