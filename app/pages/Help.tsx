// Help. Base stub; the owning phase replaces this file. Route is registered in App.tsx.
import { Empty, HelpButton, PageHead } from "../components/ui";

export function Help() {
  return (
    <div className="page">
      <PageHead title="Help" />
      <Empty title="Coming in the next release">Search, Getting Started checklist, picture-by-picture guides, Fix-it guides.</Empty>
      <HelpButton guide="getting-started" />
    </div>
  );
}
