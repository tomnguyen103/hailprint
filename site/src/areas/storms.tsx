import type { Storm, StormsIndex } from "../data/types";
import type { Tab } from "../router";
import { Workspace } from "../storms/workspace";

export function StormsArea(props: { index: StormsIndex; storm: Storm; tab: Tab }) {
  return <Workspace {...props} />;
}