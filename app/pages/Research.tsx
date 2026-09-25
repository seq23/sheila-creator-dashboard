// Research Brief. Base stub; the owning phase replaces this file. Route is registered in App.tsx.
import { Empty, HelpButton, PageHead } from "../components/ui";

export function Research() {
  return (
    <div className="page">
      <PageHead title="Research Brief" />
      <Empty title="Coming in the next release">A cited brief on what to film, how to cut it and when to post. Approve it before the first clips are cut.</Empty>
      <HelpButton guide="approve-research-brief" />
    </div>
  );
}
