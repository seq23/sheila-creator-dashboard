// Stats. Base stub; the owning phase replaces this file. Route is registered in App.tsx.
import { Empty, HelpButton, PageHead } from "../components/ui";

export function Stats() {
  return (
    <div className="page">
      <PageHead title="Stats" />
      <Empty title="Coming in the next release">What's working: top clips, best times, best cut styles.</Empty>
      <HelpButton guide="what-runway-means" />
    </div>
  );
}
